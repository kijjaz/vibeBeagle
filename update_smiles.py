import json
import os
import subprocess

PROJECT_FILE = "aroma_chemicals.json"
TGSC_FILE = "/Users/kijjaz/Desktop/Antigravity/2025/20251231 TGSC Demo Formulas/tgsc_vapor_pressure_database.json"

def main():
    if not os.path.exists(PROJECT_FILE):
        print(f"Project file {PROJECT_FILE} not found!")
        return
    if not os.path.exists(TGSC_FILE):
        print(f"TGSC file {TGSC_FILE} not found!")
        return

    with open(PROJECT_FILE, "r", encoding="utf-8") as f:
        project_mols = json.load(f)

    with open(TGSC_FILE, "r", encoding="utf-8") as f:
        tgsc_mols = json.load(f)

    # Map TGSC by CAS
    tgsc_by_cas = {}
    for m in tgsc_mols:
        cas = m.get("cas_number", "").strip()
        smiles = m.get("smiles", "").strip()
        if cas and smiles:
            if cas not in tgsc_by_cas or len(smiles) > len(tgsc_by_cas[cas].get("smiles", "")):
                tgsc_by_cas[cas] = m

    updated_count = 0
    different_list = []
    
    for m in project_mols:
        cas = m.get("cas", "").strip()
        if cas in tgsc_by_cas:
            p_smiles = m.get("smiles", "").strip()
            t_smiles = tgsc_by_cas[cas].get("smiles", "").strip()
            if p_smiles != t_smiles:
                different_list.append((m["name"], cas, p_smiles, t_smiles))
                m["smiles"] = t_smiles
                updated_count += 1

    print(f"Total project compounds: {len(project_mols)}")
    print(f"Matched and updated SMILES: {updated_count}")

    if updated_count > 0:
        # Save updated chemicals file
        with open(PROJECT_FILE, "w", encoding="utf-8") as f:
            json.dump(project_mols, f, indent=2, ensure_ascii=False)
        print(f"Saved updated SMILES to {PROJECT_FILE}")
        
        # Run simulation, comparison, and dimensionality reduction to regenerate the database
        print("\nRegenerating simulations and reports...")
        try:
            print("Running simulate_vibrations.py...")
            subprocess.run(["uv", "run", "--with", "rdkit", "--with", "numpy", "python3", "simulate_vibrations.py"], check=True)
            print("Running compare_vibrations.py...")
            subprocess.run(["uv", "run", "--with", "rdkit", "--with", "numpy", "python3", "compare_vibrations.py"], check=True)
            print("Running dim_reduction.py...")
            subprocess.run(["uv", "run", "--with", "rdkit", "--with", "numpy", "--with", "scikit-learn", "python3", "dim_reduction.py"], check=True)
            print("Successfully regenerated all project data!")
        except Exception as e:
            print(f"Error regenerating project data: {e}")
    else:
        print("No SMILES needed updating.")

if __name__ == "__main__":
    main()
