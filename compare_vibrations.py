import json
import os
import sys
import numpy as np

INPUT_JSON = 'aroma_vibrations.json'
OUTPUT_JSON = 'similarity_report.json'

def cosine_similarity(u, v):
    dot_product = np.dot(u, v)
    norm_u = np.linalg.norm(u)
    norm_v = np.linalg.norm(v)
    if norm_u == 0.0 or norm_v == 0.0:
        return 0.0
    return float(dot_product / (norm_u * norm_v))

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
    print(f"Comparing {len(valid_indices)} valid spectra...")
    
    # Calculate similarity matrix
    similarity_matrix = np.zeros((len(valid_indices), len(valid_indices)))
    for i in range(len(valid_indices)):
        for j in range(i, len(valid_indices)):
            sim = cosine_similarity(spectra[i], spectra[j])
            similarity_matrix[i, j] = sim
            similarity_matrix[j, i] = sim
            
    # Generate closest and farthest lists for each compound
    report = {}
    
    for i, idx in enumerate(valid_indices):
        comp = compounds[idx]
        cas = comp["cas"]
        name = comp["name"]
        
        # Get similarities for current compound i
        sims = similarity_matrix[i]
        
        # Pair with their valid compound indices
        pairs = []
        for j, sim_val in enumerate(sims):
            if j == i:
                continue  # skip self
            other_comp = compounds[valid_indices[j]]
            pairs.append({
                "name": other_comp["name"],
                "cas": other_comp["cas"],
                "similarity": round(sim_val, 4)
            })
            
        # Sort by similarity descending
        pairs.sort(key=lambda x: x["similarity"], reverse=True)
        
        # Top 10 closest
        closest = pairs[:10]
        
        # Top 5 farthest (since list is sorted descending, farthest are at the end)
        # Reverse them to show the absolute farthest first
        farthest = list(reversed(pairs[-5:]))
        
        report[cas] = {
            "name": name,
            "closest": closest,
            "farthest": farthest
        }
        
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        
    print(f"Similarity calculations complete. Report saved to {OUTPUT_JSON}")

if __name__ == '__main__':
    main()
