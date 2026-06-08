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
    
    similarity_matrix = np.zeros((len(valid_indices), len(valid_indices)))
    for i in range(len(valid_indices)):
        for j in range(i, len(valid_indices)):
            sim = cosine_similarity(spectra[i], spectra[j])
            similarity_matrix[i, j] = sim
            similarity_matrix[j, i] = sim
            
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