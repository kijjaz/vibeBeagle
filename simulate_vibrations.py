import json
import os
import sys
import numpy as np

# This script is designed to run with uv run --with rdkit --with numpy
try:
    from rdkit import Chem
    from rdkit.Chem import AllChem
except ImportError:
    print("Error: RDKit not found. Please run this script with uv:")
    print("uv run --with rdkit --with numpy python simulate_vibrations.py")
    sys.exit(1)

INPUT_JSON = 'aroma_chemicals.json'
OUTPUT_JSON = 'aroma_vibrations.json'

# Step size for numerical differentiation of gradients (in Angstroms)
H_STEP = 0.005
# Conversion factor from sqrt(eigenvalue in kcal/(mol*AMU*A^2)) to wavenumber in cm^-1
CONV_FACTOR = 108.5868

# Grid parameters for continuous spectrum curve
MIN_FREQ = 400.0
MAX_FREQ = 4000.0
STEP_FREQ = 10.0  # 361 points
SIGMA = 25.0  # Line-broadening width (cm^-1)

def get_grid():
    return np.arange(MIN_FREQ, MAX_FREQ + STEP_FREQ, STEP_FREQ)

def calculate_frequencies(mol):
    # Optimize conformation using UFF
    # Ensure force field is valid
    ff = AllChem.UFFGetMoleculeForceField(mol)
    if not ff:
        return None
        
    conf = mol.GetConformer()
    num_atoms = mol.GetNumAtoms()
    num_coords = 3 * num_atoms
    
    # 1. Compute Gasteiger Charges
    try:
        AllChem.ComputeGasteigerCharges(mol)
        charges = []
        for atom in mol.GetAtoms():
            val = atom.GetProp('_GasteigerCharge')
            if val == 'nan' or val == '-nan':
                charges.append(0.0)
            else:
                charges.append(float(val))
    except Exception:
        # Fallback to zero charges
        charges = [0.0] * num_atoms
        
    # 2. Initialize Hessian matrix
    H = np.zeros((num_coords, num_coords))
    
    # 3. Compute Hessian numerically from analytical gradients
    for j in range(num_coords):
        atom_idx = j // 3
        coord_idx = j % 3
        
        orig_pos = conf.GetAtomPosition(atom_idx)
        
        # Displace +h
        pos_pos = list(orig_pos)
        pos_pos[coord_idx] += H_STEP
        conf.SetAtomPosition(atom_idx, pos_pos)
        ff_pos = AllChem.UFFGetMoleculeForceField(mol)
        if not ff_pos:
            return None
        grad_pos = np.array(ff_pos.CalcGrad())
        
        # Displace -h
        pos_neg = list(orig_pos)
        pos_neg[coord_idx] -= H_STEP
        conf.SetAtomPosition(atom_idx, pos_neg)
        ff_neg = AllChem.UFFGetMoleculeForceField(mol)
        if not ff_neg:
            return None
        grad_neg = np.array(ff_neg.CalcGrad())
        
        # Restore position
        conf.SetAtomPosition(atom_idx, orig_pos)
        
        # Central difference formula
        H[:, j] = (grad_pos - grad_neg) / (2.0 * H_STEP)
        
    # Symmetrize Hessian
    H = 0.5 * (H + H.T)
    
    # 4. Get atomic masses
    masses = []
    for atom in mol.GetAtoms():
        m = atom.GetMass()
        masses.extend([m, m, m])
    masses = np.array(masses)
    
    # 5. Mass-weighted Hessian
    H_mw = H / np.sqrt(masses[:, np.newaxis] * masses[np.newaxis, :])
    
    # 6. Diagonalize and get eigenvectors
    eigenvalues, eigenvectors = np.linalg.eigh(H_mw)
    
    # 7. Convert to frequencies and calculate intensities from dipole derivatives
    raw_freqs = []
    intensities = []
    for k in range(num_coords):
        val = eigenvalues[k]
        if val > 1e-5:
            wavenumber = CONV_FACTOR * np.sqrt(val)
            raw_freqs.append(wavenumber)
        else:
            raw_freqs.append(0.0)
            
        # Cartesian displacements for normal mode k: d = l_k / sqrt(m)
        eigvec = eigenvectors[:, k]
        displacements = eigvec / np.sqrt(masses)
        
        # Dipole derivative vector
        dipole_deriv = np.zeros(3)
        for i in range(num_atoms):
            q = charges[i]
            d = displacements[3*i : 3*i+3]
            dipole_deriv += q * d
            
        # Intensity proportional to square of dipole derivative norm
        intensity = np.sum(dipole_deriv ** 2)
        intensities.append(intensity)
            
    raw_freqs = np.array(raw_freqs)
    intensities = np.array(intensities)
    
    # Sort by frequency
    sort_idx = np.argsort(raw_freqs)
    raw_freqs = raw_freqs[sort_idx]
    intensities = intensities[sort_idx]
    
    # Filter physical modes (remove translation/rotation modes) and keep only IR-active modes
    vibrational_freqs = []
    vibrational_intensities = []
    max_intensity = np.max(intensities[6:]) if len(intensities) > 6 else 0.0
    for f, int_val in zip(raw_freqs[6:], intensities[6:]):
        if f > 1.0:
            # Keep if the mode has at least 1% of the maximum mode intensity of this molecule
            # or has a significant absolute intensity (e.g. > 0.001)
            if max_intensity > 0 and (int_val >= 0.01 * max_intensity or int_val >= 0.001):
                vibrational_freqs.append(float(f))
                vibrational_intensities.append(float(int_val))
            
    return vibrational_freqs, vibrational_intensities

def generate_spectrum_curve(frequencies, intensities, grid):
    # Sum of Gaussians centered at each frequency weighted by calculated intensity
    spectrum = np.zeros_like(grid)
    if not frequencies:
        return spectrum.tolist()
        
    for f, intensity in zip(frequencies, intensities):
        # Gaussian distribution
        spectrum += intensity * np.exp(-0.5 * ((grid - f) / SIGMA) ** 2)
        
    # Normalize spectrum so the peak intensity is exactly 1.0
    max_val = np.max(spectrum)
    if max_val > 1e-6:
        spectrum = spectrum / max_val
        
    return spectrum.tolist()

def main():
    if not os.path.exists(INPUT_JSON):
        print(f"Error: {INPUT_JSON} not found. Run filter_compounds.py first.")
        sys.exit(1)
        
    with open(INPUT_JSON, 'r', encoding='utf-8') as f:
        compounds = json.load(f)
        
    print(f"Loaded {len(compounds)} aroma chemicals to simulate.")
    
    grid = get_grid()
    simulated_data = []
    success_count = 0
    
    for i, c in enumerate(compounds):
        name = c["name"]
        smiles = c["smiles"]
        cas = c["cas"]
        
        print(f"[{i+1}/{len(compounds)}] Simulating {name} (CAS: {cas})... ", end="", flush=True)
        
        try:
            # Construct RDKit molecule
            mol = Chem.MolFromSmiles(smiles)
            if not mol:
                print("FAILED (Invalid SMILES)")
                continue
                
            mol = Chem.AddHs(mol)
            
            # Embed molecule in 3D
            embed_ok = AllChem.EmbedMolecule(mol, randomSeed=42)
            if embed_ok < 0:
                # Try fallback coordination generator
                embed_ok = AllChem.EmbedMolecule(mol, useRandomCoords=True, randomSeed=42)
                if embed_ok < 0:
                    print("FAILED (3D Embedding failed)")
                    continue
                    
            # Optimize geometry
            opt_ok = AllChem.UFFOptimizeMolecule(mol, maxIters=1000)
            
            # Compute vibrational frequencies and transition intensities
            freq_data = calculate_frequencies(mol)
            if freq_data is None:
                print("FAILED (Hessian calculation failed)")
                continue
                
            freqs, intensities = freq_data
            
            # Generate smoothed spectrum curve
            curve = generate_spectrum_curve(freqs, intensities, grid)
            
            # Generate coarse 36-bin histogram for compatibility, weighted by intensity
            hist, _ = np.histogram(freqs, bins=36, range=(400.0, 4000.0), weights=intensities)
            
            c_data = c.copy()
            c_data.update({
                "vibrational_frequencies": [round(f, 2) for f in freqs],
                "spectrum_grid": grid.tolist(),
                "spectrum_curve": [round(y, 4) for y in curve],
                "spectrum_histogram": hist.tolist()
            })
            simulated_data.append(c_data)
            success_count += 1
            print(f"SUCCESS ({len(freqs)} modes)")
            
        except Exception as e:
            print(f"ERROR: {e}")
            
    # Save simulated vibrations
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(simulated_data, f, indent=2, ensure_ascii=False)
        
    print(f"\nSimulation complete: {success_count}/{len(compounds)} compounds successfully simulated.")
    print(f"Data saved to {OUTPUT_JSON}")

if __name__ == '__main__':
    main()
