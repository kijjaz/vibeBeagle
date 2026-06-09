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

# Pattern for validating standard CAS numbers
CAS_PATTERN = re.compile(r'^\d+-\d+-\d+$')

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cache = json.load(f)
                # Filter out previous failed lookups so we can retry them with synonyms/clean names
                cleared_cache = {k: v for k, v in cache.items() if not (isinstance(v, dict) and "error" in v)}
                print(f"Loaded {len(cleared_cache)} cached items (cleared {len(cache) - len(cleared_cache)} errors for retry).")
                return cleared_cache
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
    parts = cas_str.split('-')
    if len(parts) != 3:
        return False
    digits_str = "".join(parts[:-1])
    if not digits_str.isdigit() or not parts[-1].isdigit():
        return False
    check_digit = int(parts[-1])
    
    # Calculate sum digits weight
    total = 0
    weight = 1
    for char in reversed(digits_str):
        total += int(char) * weight
        weight += 1
    return (total % 10) == check_digit

def get_cas_from_synonyms(cid):
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/synonyms/JSON"
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            synonyms = data.get("InformationList", {}).get("Information", [{}])[0].get("Synonym", [])
            for s in synonyms:
                s = s.strip()
                if '-' in s:
                    if CAS_PATTERN.match(s) and is_valid_cas(s):
                        return s
    except Exception:
        pass
    return None

def resolve_cas_pubchem(cas):
    encoded_cas = urllib.parse.quote(cas)
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{encoded_cas}/property/CanonicalSMILES,IsomericSMILES,MolecularFormula,MolecularWeight/JSON"
    
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            properties = data.get("PropertyTable", {}).get("Properties", [])
            if properties:
                prop = properties[0]
                smiles = prop.get("CanonicalSMILES") or prop.get("IsomericSMILES") or prop.get("ConnectivitySMILES")
                if smiles:
                    return {
                        "cid": prop.get("CID"),
                        "smiles": smiles,
                        "formula": prop.get("MolecularFormula"),
                        "weight": float(prop.get("MolecularWeight", 0.0))
                    }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"error": "not_found"}
        else:
            return {"error": f"http_{e.code}"}
    except Exception as e:
        return {"error": str(e)}
    return {"error": "unknown"}

def resolve_name_pubchem(name):
    # 1. Clean dilution markers and common suffixes
    clean_n = re.sub(r'\s+\d+%.*$', '', name, flags=re.IGNORECASE)
    clean_n = re.sub(r'\s+F-TEC$', '', clean_n, flags=re.IGNORECASE)
    clean_n = re.sub(r'\s+Fleuressence$', '', clean_n, flags=re.IGNORECASE)
    
    # 2. Strip parentheticals like (FEMA-2858), (90%), etc.
    clean_n = re.sub(r'\(.*?\)', '', clean_n)
    
    # 3. Split by commas to try synonyms
    synonyms = [s.strip() for s in clean_n.split(',')]
    
    # Filter out empty or extremely short candidates
    synonyms = [s for s in synonyms if len(s.replace('"', '').replace("'", "").strip()) > 2]
    
    # If no synonyms left, try the original name
    if not synonyms:
        synonyms = [name.strip()]
        
    for syn in synonyms:
        syn_clean = syn.replace('"', '').replace("'", "").strip()
        encoded_name = urllib.parse.quote(syn_clean)
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{encoded_name}/property/CanonicalSMILES,IsomericSMILES,MolecularFormula,MolecularWeight/JSON"
        
        try:
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
                properties = data.get("PropertyTable", {}).get("Properties", [])
                if properties:
                    prop = properties[0]
                    smiles = prop.get("CanonicalSMILES") or prop.get("IsomericSMILES") or prop.get("ConnectivitySMILES")
                    if smiles:
                        return {
                            "cid": prop.get("CID"),
                            "smiles": smiles,
                            "formula": prop.get("MolecularFormula"),
                            "weight": float(prop.get("MolecularWeight", 0.0))
                        }
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue
            else:
                return {"error": f"http_{e.code}"}
        except Exception as e:
            return {"error": str(e)}
            
    return {"error": "not_found"}

def main():
    print("Loading optimized materials database...")
    if not os.path.exists(INPUT_CSV):
        print(f"Error: Input database not found at {INPUT_CSV}")
        return

    cache = load_cache()
    filtered_materials = []
    
    with open(INPUT_CSV, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Total rows in database: {len(rows)}")
    
    # First pass: Filter candidates based on names (blacklist)
    candidates = []
    for row in rows:
        name = row.get('Material Name', '').strip()
        cas_raw = row.get('CAS', '').strip()
        fema = row.get('FEMA', '').strip()
        cheapest_price_str = row.get('Cheapest (THB/g)', '').strip()
        
        # Check blacklist in name
        name_lower = name.lower()
        if any(keyword in name_lower for keyword in BLACKLIST_KEYWORDS):
            continue
            
        # Clean CAS number
        cas = cas_raw.replace("'", "").strip()
        if cas and not CAS_PATTERN.match(cas):
            cas = "" # treat as empty if invalid format
            
        # Parse cheapest price
        price = 0.0
        price_match = re.search(r'([\d\.]+)', cheapest_price_str)
        if price_match:
            try:
                price = float(price_match.group(1))
            except ValueError:
                pass
                
        candidates.append({
            "name": name,
            "cas": cas,
            "fema": fema,
            "price_thb_g": price,
            "vendors": row.get('Vendors', '').strip(),
            "all_links": row.get('All Links', '').strip()
        })
        
    print(f"Candidates passing initial name/CAS filter: {len(candidates)}")
    
    # Second pass: Resolve candidates via PubChem (with rate limiting)
    resolved_count = 0
    skipped_count = 0
    failed_count = 0
    
    for i, cand in enumerate(candidates):
        cas = cand["cas"]
        name = cand["name"]
        
        # Unique cache key: use CAS if present, otherwise name
        cache_key = cas if cas else f"NAME_{name}"
        
        print(f"[{i+1}/{len(candidates)}] Resolving {name} (CAS: {cas or 'Empty'})... ", end="", flush=True)
        
        # Check cache
        if cache_key in cache:
            pubchem_data = cache[cache_key]
            print("(cached) ", end="")
        else:
            # Query PubChem
            if cas:
                pubchem_data = resolve_cas_pubchem(cas)
            else:
                pubchem_data = resolve_name_pubchem(name)
                
            cache[cache_key] = pubchem_data
            save_cache(cache)
            time.sleep(0.25)  # Enforce rate limit (max 4 requests per second)
            
        if "error" in pubchem_data:
            if pubchem_data["error"] == "not_found":
                print("FAILED (Not found on PubChem)")
            else:
                print(f"FAILED (Error: {pubchem_data['error']})")
            failed_count += 1
        else:
            # Exclude mixtures (SMILES containing dots represent multi-component salts or mixtures)
            smiles = pubchem_data["smiles"]
            if "." in smiles:
                print("SKIPPED (Multi-component / Mixture structure)")
                skipped_count += 1
                continue
                
            # If CAS was empty, try to resolve CAS from synonyms
            resolved_cas = cas
            if not resolved_cas:
                cid = pubchem_data["cid"]
                syn_key = f"SYN_CAS_{cid}"
                
                if syn_key in cache:
                    resolved_cas = cache[syn_key]
                else:
                    resolved_cas = get_cas_from_synonyms(cid)
                    cache[syn_key] = resolved_cas
                    save_cache(cache)
                    time.sleep(0.25)
                
                if resolved_cas:
                    print(f"FOUND CAS: {resolved_cas} ", end="")
                else:
                    # Fallback to CID identifier if no CAS synonym
                    resolved_cas = f"CID-{cid}"
                    print(f"USING CID-KEY: {resolved_cas} ", end="")
            
            print("SUCCESS")
            cand.update({
                "cas": resolved_cas,
                "cid": pubchem_data["cid"],
                "smiles": smiles,
                "formula": pubchem_data["formula"],
                "weight": pubchem_data["weight"]
            })
            filtered_materials.append(cand)
            resolved_count += 1
            
    # Save output JSON
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(filtered_materials, f, indent=2, ensure_ascii=False)
        
    print("\n--- Filtering Summary ---")
    print(f"Pure Aroma Chemicals Isolated: {resolved_count}")
    print(f"Failed to Resolve: {failed_count}")
    print(f"Skipped as Mixtures: {skipped_count}")
    print(f"Saved database to {OUTPUT_JSON}")

if __name__ == '__main__':
    main()