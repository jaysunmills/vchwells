#!/usr/bin/env python3
"""
Enrich well data with parcel coordinates, addresses, and quality indicators.
Pulls parcel boundaries from NDWR ArcGIS service and maps wells by APN.
"""

import json
import urllib.request
import sys
from pathlib import Path

PARCEL_URL = (
    "https://arcgis.water.nv.gov/arcgis/rest/services/BaseLayers/County_Parcels_in_Nevada/MapServer/0/query"
    "?where=County%3D%27Storey%27"
    "&geometry=-119.75%2C39.25%2C-119.45%2C39.45"
    "&geometryType=esriGeometryEnvelope&inSR=4326"
    "&spatialRel=esriSpatialRelIntersects"
    "&outFields=APN,Acres"
    "&returnGeometry=true&outSR=4326&f=geojson"
)

WELLS_PATH = Path(__file__).parent.parent / "src" / "data" / "wells.json"


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


def pdf_url(well_id: str) -> str:
    num = int(well_id)
    bucket = (num // 1000) * 1000
    return f"https://images.water.nv.gov/images/well_logs/{bucket:05d}/{well_id}.pdf"


def compute_centroid(geometry: dict) -> tuple:
    if geometry["type"] == "Polygon":
        coords = geometry["coordinates"][0]
    elif geometry["type"] == "MultiPolygon":
        coords = geometry["coordinates"][0][0]
    else:
        return (0.0, 0.0)
    lats = [c[1] for c in coords]
    lngs = [c[0] for c in coords]
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))


def main():
    print("Loading wells...")
    with open(WELLS_PATH) as f:
        wells = json.load(f)
    print(f"  {len(wells)} wells loaded")

    print("Fetching parcel data from NDWR ArcGIS...")
    resp = urllib.request.urlopen(PARCEL_URL)
    parcel_data = json.loads(resp.read())
    features = parcel_data.get("features", [])
    print(f"  {len(features)} parcels loaded")

    # Build parcel lookup: APN -> { centroid, acres }
    parcel_lookup: dict = {}
    for f in features:
        apn = (f["properties"].get("APN") or "").strip()
        if not apn:
            continue
        lat, lng = compute_centroid(f["geometry"])
        parcel_lookup[apn] = {
            "parcel_apn": apn,
            "parcel_lat": round(lat, 6),
            "parcel_lng": round(lng, 6),
            "parcel_acres": round(f["properties"].get("Acres", 0), 2),
        }

    print(f"  {len(parcel_lookup)} parcels indexed")

    # Enrich each well
    stats = {"parcel_matched": 0, "no_match": 0, "no_apn": 0}

    for w in wells:
        pa = well_apn_to_parcel_apn(w.get("apn", ""))

        # Quality indicators
        w["pdfUrl"] = pdf_url(w["id"])
        w["parcelApn"] = pa
        w["dataQuality"] = "no_apn"
        w["parcelLat"] = None
        w["parcelLng"] = None
        w["parcelAcres"] = None
        w["originalLat"] = w["lat"]
        w["originalLng"] = w["lng"]
        w["gpsSource"] = "ndwr"

        if pa and pa in parcel_lookup:
            p = parcel_lookup[pa]
            w["parcelLat"] = p["parcel_lat"]
            w["parcelLng"] = p["parcel_lng"]
            w["parcelAcres"] = p["parcel_acres"]
            w["lat"] = p["parcel_lat"]
            w["lng"] = p["parcel_lng"]
            w["dataQuality"] = "parcel_matched"
            w["gpsSource"] = "parcel_centroid"
            stats["parcel_matched"] += 1
        elif pa:
            w["dataQuality"] = "no_match"
            stats["no_match"] += 1
        else:
            stats["no_apn"] += 1

    print(f"\nResults:")
    print(f"  Parcel matched: {stats['parcel_matched']}")
    print(f"  APN no match:   {stats['no_match']}")
    print(f"  No APN:         {stats['no_apn']}")

    with open(WELLS_PATH, "w") as f:
        json.dump(wells, f)
    print(f"\nSaved to {WELLS_PATH}")
    print(f"File size: {WELLS_PATH.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
