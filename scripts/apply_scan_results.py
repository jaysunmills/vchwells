#!/usr/bin/env python3
"""
Apply scan results back to wells.json.
Compares APN from PDF scan vs database, flags mismatches, updates coordinates.

Usage:
  python3 scripts/apply_scan_results.py              # Preview changes
  python3 scripts/apply_scan_results.py --apply      # Apply changes to wells.json
"""

import json
import re
import argparse
import urllib.request
from pathlib import Path

WELLS_PATH = Path(__file__).parent.parent / "src" / "data" / "wells.json"
SCAN_RESULTS_PATH = Path(__file__).parent.parent / "src" / "data" / "scan_results.json"

PARCEL_URL = (
    "https://arcgis.water.nv.gov/arcgis/rest/services/BaseLayers/County_Parcels_in_Nevada/MapServer/0/query"
)


def well_apn_to_parcel_apn(well_apn: str) -> str:
    if not well_apn or "-" not in well_apn:
        return None
    parts = well_apn.split("-")
    if len(parts) != 3:
        return None
    try:
        book = int(parts[0])
    except ValueError:
        return None
    return f"{book}{parts[1]}{parts[2]}"


def normalize_apn(apn: str) -> str:
    """Normalize APN to XXX-XXX-XX format."""
    cleaned = apn.replace(" ", "-").strip()
    parts = cleaned.split("-")
    if len(parts) == 3:
        return f"{int(parts[0]):03d}-{parts[1]}-{parts[2]}"
    return cleaned


def lookup_parcel_centroid(parcel_apn: str):
    url = (
        f"{PARCEL_URL}?where=APN%3D%27{parcel_apn}%27+AND+County%3D%27Storey%27"
        f"&outFields=APN&returnGeometry=true&outSR=4326&f=geojson"
    )
    try:
        resp = urllib.request.urlopen(url, timeout=10)
        data = json.loads(resp.read())
        if data.get("features"):
            geom = data["features"][0]["geometry"]
            coords = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
            lats = [c[1] for c in coords]
            lngs = [c[0] for c in coords]
            return (round(sum(lats) / len(lats), 6), round(sum(lngs) / len(lngs), 6))
    except Exception:
        pass
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply changes to wells.json")
    parser.add_argument("--min-confidence", default="high", choices=["high", "medium", "low"],
                        help="Minimum confidence to apply (default: high)")
    args = parser.parse_args()

    confidence_rank = {"high": 3, "medium": 2, "low": 1, "unknown": 0}
    min_rank = confidence_rank[args.min_confidence]

    with open(WELLS_PATH) as f:
        wells = json.load(f)
    wells_by_id = {w["id"]: w for w in wells}

    if not SCAN_RESULTS_PATH.exists():
        print("No scan results found. Run scan_wells.py first.")
        return

    with open(SCAN_RESULTS_PATH) as f:
        scan_results = json.load(f)

    print(f"Wells: {len(wells)}, Scan results: {len(scan_results)}\n")

    matches = 0
    mismatches = 0
    new_apns = 0
    corrections = []

    for well_id, result in scan_results.items():
        if not result.get("success"):
            continue

        well = wells_by_id.get(well_id)
        if not well:
            continue

        scan_apn = result.get("apn_from_log") or result.get("apn")
        if not scan_apn or scan_apn == "N/A":
            continue

        # Validate scan APN format (must look like XXX-XXX-XX)
        scan_normalized = normalize_apn(scan_apn)
        if not re.match(r'^\d{2,3}-\d{2,3}-\d{2,3}$', scan_normalized.replace('X', '').replace('x', '')):
            continue

        confidence = result.get("confidence", "unknown")
        if confidence_rank.get(confidence, 0) < min_rank:
            continue

        db_normalized = normalize_apn(well.get("apn", "")) if well.get("apn") else None

        if db_normalized and scan_normalized == db_normalized:
            matches += 1
        elif db_normalized and scan_normalized != db_normalized:
            mismatches += 1
            corrections.append({
                "well_id": well_id,
                "db_apn": well["apn"],
                "log_apn": scan_apn,
                "log_normalized": scan_normalized,
                "confidence": result.get("confidence", "unknown"),
            })
        elif not db_normalized:
            new_apns += 1
            corrections.append({
                "well_id": well_id,
                "db_apn": None,
                "log_apn": scan_apn,
                "log_normalized": scan_normalized,
                "confidence": result.get("confidence", "unknown"),
            })

    print(f"APN matches (DB = log):  {matches}")
    print(f"APN mismatches:          {mismatches}")
    print(f"New APNs (DB was empty): {new_apns}")

    if corrections:
        print(f"\nCorrections to apply ({len(corrections)}):")
        for c in corrections:
            tag = "NEW" if c["db_apn"] is None else "FIX"
            print(f"  [{tag}] Well #{c['well_id']}: {c['db_apn']} -> {c['log_apn']} (confidence: {c['confidence']})")

    if args.apply and corrections:
        print("\nApplying corrections...")
        applied = 0
        for c in corrections:
            well = wells_by_id[c["well_id"]]
            well["apn"] = c["log_normalized"]
            well["dataQuality"] = "log_verified"

            pa = well_apn_to_parcel_apn(c["log_normalized"])
            if pa:
                centroid = lookup_parcel_centroid(pa)
                if centroid:
                    well["lat"] = centroid[0]
                    well["lng"] = centroid[1]
                    well["parcelLat"] = centroid[0]
                    well["parcelLng"] = centroid[1]
                    well["gpsSource"] = "parcel_centroid"
                    well["parcelApn"] = pa
                    print(f"  Well #{c['well_id']}: APN corrected, coordinates updated")
                    applied += 1
                else:
                    print(f"  Well #{c['well_id']}: APN corrected, parcel not found in GIS")
            else:
                print(f"  Well #{c['well_id']}: APN corrected, format not mappable")

        with open(WELLS_PATH, "w") as f:
            json.dump(wells, f)
        print(f"\nApplied {applied} corrections to {WELLS_PATH}")
    elif not args.apply and corrections:
        print("\nRun with --apply to write changes.")


if __name__ == "__main__":
    main()
