import json
import os
import sys
import numpy as np

# Ensure scikit-learn is available
try:
    from sklearn.manifold import MDS
except ImportError:
    print("Error: scikit-learn not found. Run this script using uv:")
    print("uv run --with scikit-learn --with numpy python3 dim_reduction.py")
    sys.exit(1)

INPUT_JSON = 'aroma_vibrations.json'

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
        print(f"Error: {INPUT_JSON} not found. Run simulation first.")
        sys.exit(1)

    with open(INPUT_JSON, 'r', encoding='utf-8') as f:
        compounds = json.load(f)

    n_compounds = len(compounds)
    print(f"Loaded {n_compounds} compounds from {INPUT_JSON} for dimensionality reduction.")

    if n_compounds < 3:
        print("Too few compounds to perform dimensionality reduction.")
        return

    # Extract spectrum curves
    valid_indices = []
    spectra = []

    for i, c in enumerate(compounds):
        curve = c.get("spectrum_curve", [])
        if len(curve) > 0:
            spectra.append(np.array(curve))
            valid_indices.append(i)

    if len(valid_indices) == 0:
        print("No valid spectrum curves found.")
        return

    spectra = np.array(spectra)
    n_valid = len(valid_indices)
    print(f"Computing distance matrix for {n_valid} valid spectra using optimized band weighting...")

    # Build the weight vector and apply to spectra
    w_vec = build_weight_vector()
    weighted_spectra = spectra * w_vec
    
    # Vectorized cosine distance matrix calculation
    norms = np.linalg.norm(weighted_spectra, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0  # Avoid division by zero
    
    normalized_spectra = weighted_spectra / norms
    sim_matrix = np.dot(normalized_spectra, normalized_spectra.T)
    sim_matrix = np.clip(sim_matrix, -1.0, 1.0)
    
    # Cosine distance matrix
    dist_matrix = 1.0 - sim_matrix

    print("Running Multidimensional Scaling (MDS)...")
    try:
        # Metric MDS preserves global metric relationships
        mds = MDS(n_components=2, dissimilarity='precomputed', random_state=42, n_init=4, max_iter=300)
        coords = mds.fit_transform(dist_matrix)
    except Exception as e:
        print(f"MDS failed: {e}. Falling back to random projection coordinates...")
        coords = np.random.uniform(-1.0, 1.0, (n_valid, 2))

    # Normalize coordinates to a standard network layout bounding box [-1000, 1000]
    x_min, x_max = coords[:, 0].min(), coords[:, 0].max()
    y_min, y_max = coords[:, 1].min(), coords[:, 1].max()

    x_range = (x_max - x_min) if (x_max - x_min) > 0 else 1.0
    y_range = (y_max - y_min) if (y_max - y_min) > 0 else 1.0

    # Center and scale
    scaled_coords = np.zeros_like(coords)
    scaled_coords[:, 0] = -800 + 1600 * (coords[:, 0] - x_min) / x_range
    scaled_coords[:, 1] = -800 + 1600 * (coords[:, 1] - y_min) / y_range

    # Map back coordinates into our original list of compounds
    for idx_in_valid, orig_idx in enumerate(valid_indices):
        compounds[orig_idx]["x"] = round(float(scaled_coords[idx_in_valid, 0]), 2)
        compounds[orig_idx]["y"] = round(float(scaled_coords[idx_in_valid, 1]), 2)

    # For any compounds without spectrum_curve, set coordinate to 0,0
    for i, c in enumerate(compounds):
        if "x" not in c or "y" not in c:
            c["x"] = 0.0
            c["y"] = 0.0

    # Save the updated data (minified to keep file size small for web performance)
    with open(INPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(compounds, f, ensure_ascii=False)

    print(f"Successfully saved 2D coordinates to {INPUT_JSON}")

if __name__ == '__main__':
    main()
