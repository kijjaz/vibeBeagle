import csv
import json
import os
import re
import time
import urllib.request
import urllib.parse

# Setup paths
INPUT_CSV = '../20260116 My Perfume Raw Materials/optimized_perfume_materials.csv'
OUTPUT_JSON = 'aroma_chemicals.json'
CACHE_FILE = 'pubchem_cache.json'

# Blacklist keywords for mixtures, essential oils, and perfume bases
BLACKLIST_KEYWORDS = [
    'oil', 'essential', 'base', 'blend', 'co2', 'extract', 'absolute', 'resinoid', 
    'tincture', 'reco', 'f-tec', 'fleuressence', 'solution', 'dilution', 'fractionated',
    'infusion', 'concrete', ' reconstituted', 'type', 'sandalwood e.o.',
    'natural', 'naturals', 'organic', 'purified water', 'dpg', 'tec', 'ipm', 'bb', 'dep',
    'solvent', 'carrier', 'perfumer', 'perfumery'
]

CAS_PATTERN = re.compile(r'^\d+-\d+-\d+$')

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading cache: {e}")
    return {}

def save_cache(cache):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving cache: {e}")

def is_valid_cas(cas_str):
    if not cas_str or not CAS_PATTERN.match(cas_str):
        return False
    parts = cas_str.split('-')
    digits_str = "".join(parts[:-1])
    if not digits_str.isdigit() or not parts[-1].isdigit():
        return False
    check_digit = int(parts[-1])
    
    total = 0
    weight = 1
    for char in reversed(digits_str):
        total += int(char) * weight
        weight += 1
    return (total % 10) == check_digit

def get_pubchem_data(query_val, query_type="name"):
    # query_type can be "name" or "cid"
    if query_type == "name":
        quoted = urllib.parse.quote(query_val)
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{quoted}/property/CanonicalSMILES,MolecularFormula,MolecularWeight/JSON"
    else:
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{query_val}/property/CanonicalSMILES,MolecularFormula,MolecularWeight/JSON"
        
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            properties = data.get("PropertyTable", {}).get("Properties", [])
            if properties:
                return properties[0]
    except Exception:
        pass
    return None

def get_cid_by_name_or_cas(query_val):
    quoted = urllib.parse.quote(query_val)
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{quoted}/cids/JSON"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            cids = data.get("IdentifierList", {}).get("CID", [])
            if cids:
                return cids[0]
    except Exception:
        pass
    return None

def main():
    cache = load_cache()
    print(f"Loaded {len(cache)} cached items.")
    
    if not os.path.exists(INPUT_CSV):
        print(f"Error: {INPUT_CSV} not found!")
        return
        
    filtered_compounds = []
    
    with open(INPUT_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("material_name", "").strip()
            cas = row.get("cas_number", "").strip()
            
            # Check blacklist
            is_blacklisted = False
            lower_name = name.lower()
            for kw in BLACKLIST_KEYWORDS:
                if kw in lower_name:
                    is_blacklisted = True
                    break
            if is_blacklisted:
                continue
                
            # Keep if valid CAS or name is reasonable
            if cas and not is_valid_cas(cas):
                # Try cleaning CAS
                m = re.search(r'(\d+-\d+-\d+)', cas)
                if m and is_valid_cas(m.group(1)):
                    cas = m.group(1)
                else:
                    cas = ""
                    
            if not cas and not name:
                continue
                
            filtered_compounds.append({
                "name": name,
                "cas": cas,
                "fema": row.get("fema_number", "").strip(),
                "price_thb_g": float(row.get("price_thb_g", 0.0) or 0.0),
                "vendors": row.get("vendors", "").strip(),
                "all_links": row.get("all_links", "").strip()
            })
            
    print(f"Filtered {len(filtered_compounds)} compounds from CSV.")
    
    output_data = []
    
    for i, comp in enumerate(filtered_compounds):
        name = comp["name"]
        cas = comp["cas"]
        
        # Look up cache
        cache_key = cas if cas else name
        prop = cache.get(cache_key)
        
        if not prop:
            print(f"[{i+1}/{len(filtered_compounds)}] Querying PubChem for {name} (CAS: {cas})... ", end="", flush=True)
            prop = None
            if cas:
                prop = get_pubchem_data(cas, "name")
            if not prop:
                # Try by name
                prop = get_pubchem_data(name, "name")
            if not prop:
                # Try getting CID and query by CID
                cid = get_cid_by_name_or_cas(cas if cas else name)
                if cid:
                    prop = get_pubchem_data(cid, "cid")
                    
            if prop:
                cache[cache_key] = prop
                save_cache(cache)
                print("SUCCESS")
                time.sleep(0.2)
            else:
                print("FAILED")
                
        if prop:
            comp_data = comp.copy()
            comp_data.update({
                "cid": prop.get("CID"),
                "smiles": prop.get("CanonicalSMILES", ""),
                "formula": prop.get("MolecularFormula", ""),
                "weight": prop.get("MolecularWeight", 0.0)
            })
            output_data.append(comp_data)
            
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
        
    print(f"Filtered database saved with {len(output_data)} chemicals to {OUTPUT_JSON}.")

if __name__ == '__main__':
    main()