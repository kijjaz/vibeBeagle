import json
import os
import sys
import numpy as np

INPUT_JSON = 'aroma_vibrations.json'
OUTPUT_JSON = 'similarity_report.json'

# Optimal band weights for scent category separation
BANDS = [
    ("Skeletal_Bends", 400.0, 700.0, 1.25),
    ("Alkene_OOP", 700.0, 1000.0, 1.35),
    ("C_O_Stretches", 1000.0, 1300.0, 1.60),
    ("Alkyl_Deforms", 1300.0, 1400.0, 0.65),
    ("Aromatic_Double", 1400.0, 1650.0, 1.0231),
    ("Carbonyl", 1650.0, 1800.0, 1.5616),
    ("Triple_Nitrile", 2100.0, 2260.0, 15.0000),
    ("Thiol", 2500.0, 2600.0, 0.1898),
    ("Aliphatic_CH", 2800.0, 3000.0, 0.3528),
    ("Aromatic_CH", 3000.0, 3150.0, 0.7438),
    ("Hydroxyl", 3150.0, 3650.0, 0.0425)
]

def build_weight_vector():
    grid = np.arange(400.0, 4000.0 + 10.0, 10.0)
    w_vec = np.ones_like(grid)
    for name, start, end, w in BANDS:
        mask = (grid >= start) & (grid <= end)
        w_vec[mask] = w
    return w_vec

def main():
    if not os.path.exists(INPUT_JSON):
        print(f"Error: {INPUT_JSON} not found. Run simulate_vibrations.py first.")
        sys.exit(1)
        
    with open(INPUT_JSON, 'r', encoding='utf-8') as f:
        compounds = json.load(f)
        
    n_compounds = len(compounds)
    print(f"Loaded {n_compounds} simulated compounds to compare.")
    
    if n_compounds == 0:
        print("No compounds to analyze.")
        return
        
    # Convert all spectrum curves to numpy array for efficient computation
    spectra = []
    valid_indices = []
    
    for i, c in enumerate(compounds):
        curve = c.get("spectrum_curve", [])
        if len(curve) > 0:
            spectra.append(np.array(curve))
            valid_indices.append(i)
            
    spectra = np.array(spectra)
    print(f"Comparing {len(valid_indices)} valid spectra using optimized band weighting...")
    
    # Build the weight vector and apply to spectra
    w_vec = build_weight_vector()
    weighted_spectra = spectra * w_vec
    
    # Vectorized cosine similarity computation
    norms = np.linalg.norm(weighted_spectra, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0  # Avoid division by zero
    
    normalized_spectra = weighted_spectra / norms
    similarity_matrix = np.dot(normalized_spectra, normalized_spectra.T)
    similarity_matrix = np.clip(similarity_matrix, -1.0, 1.0)
            
    report = {}
    for i, idx in enumerate(valid_indices):
        comp = compounds[idx]
        cas = comp["cas"]
        name = comp["name"]
        
        # We need to sort matches
        matches = []
        for j, other_idx in enumerate(valid_indices):
            if i == j:
                continue
            other_comp = compounds[other_idx]
            matches.append({
                "name": other_comp["name"],
                "cas": other_comp["cas"],
                "similarity": round(float(similarity_matrix[i, j]), 4)
            })
            
        # Sort matches by similarity descending
        matches.sort(key=lambda x: x["similarity"], reverse=True)
        
        closest = matches[:50]
        farthest = sorted(matches, key=lambda x: x["similarity"])[:50]
        
        report[cas] = {
            "name": name,
            "closest": closest,
            "farthest": farthest
        }
        
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        
    print(f"Similarity report written to {OUTPUT_JSON}")

if __name__ == '__main__':
    main()