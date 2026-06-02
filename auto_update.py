import json
import os
import time
import subprocess

CHEMICALS_FILE = 'aroma_chemicals.json'
VIBRATIONS_FILE = 'aroma_vibrations.json'

def get_compounds_count(filename):
    if not os.path.exists(filename):
        return 0
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return len(data)
    except Exception:
        return 0

def run_cmd(cmd):
    try:
        # Run using uv to ensure rdkit, numpy, and scikit-learn are loaded
        full_cmd = ["uv", "run", "--with", "rdkit", "--with", "numpy", "--with", "scikit-learn"] + cmd
        print(f"Running: {' '.join(full_cmd)}")
        subprocess.run(full_cmd, check=True)
    except Exception as e:
        print(f"Error running command {cmd}: {e}")

def main():
    print("Starting auto-updater...")
    last_simulated_count = 0
    
    # Initialize with what is already simulated
    last_simulated_count = get_compounds_count(VIBRATIONS_FILE)
    print(f"Initially simulated: {last_simulated_count} compounds.")

    while True:
        current_count = get_compounds_count(CHEMICALS_FILE)
        
        if current_count > last_simulated_count:
            print(f"\nNew compounds detected! Filtered: {current_count}, Simulated: {last_simulated_count}")
            print("Updating vibrations, similarities, and 2D coordinates...")
            
            # Run simulation
            run_cmd(["python3", "simulate_vibrations.py"])
            # Run comparison
            run_cmd(["python3", "compare_vibrations.py"])
            # Run dimensionality reduction
            run_cmd(["python3", "dim_reduction.py"])
            
            last_simulated_count = current_count
            print(f"Update complete. Now showing {last_simulated_count} compounds on the dashboard.")
            
        # Check if filter_compounds.py is still running
        # In a simple check, we can just look for the process
        # (or just sleep and run forever until stopped manually)
        time.sleep(15)

if __name__ == '__main__':
    main()
