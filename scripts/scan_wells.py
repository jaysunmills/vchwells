#!/usr/bin/env python3
"""
Scan well log PDFs to extract/verify APN and key fields.
- Post-2020: Extract text directly from digital PDFs
- Pre-2020: Use Claude Vision to OCR scanned images

Usage:
  python3 scripts/scan_wells.py                    # Scan all wells
  python3 scripts/scan_wells.py --text-only        # Only digital PDFs (free)
  python3 scripts/scan_wells.py --well 48080       # Scan a single well
  python3 scripts/scan_wells.py --limit 10         # Scan first N unscanned wells
"""

import json
import re
import sys
import time
import base64
import urllib.request
import tempfile
import argparse
from pathlib import Path

try:
    import fitz  # pymupdf
except ImportError:
    print("pip3 install pymupdf")
    sys.exit(1)

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

WELLS_PATH = Path(__file__).parent.parent / "src" / "data" / "wells.json"
SCAN_RESULTS_PATH = Path(__file__).parent.parent / "src" / "data" / "scan_results.json"


def pdf_url(well_id: str) -> str:
    num = int(well_id)
    bucket = (num // 1000) * 1000
    return f"https://images.water.nv.gov/images/well_logs/{bucket:05d}/{well_id}.pdf"


def download_pdf(url: str) -> bytes:
    try:
        resp = urllib.request.urlopen(url, timeout=15)
        return resp.read()
    except Exception as e:
        print(f"    Download failed: {e}")
        return None


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text.strip()


def pdf_to_image_base64(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)
    return base64.standard_b64encode(pix.tobytes("png")).decode()


def parse_apn_from_text(text: str) -> str:
    patterns = [
        r'(\d{3}[-\s]?\d{3}[-\s]?\d{2,3})',
        r'APN[:\s]*([^\n]+)',
        r'[Pp]arcel[:\s]*([^\n]+)',
        r'(\d{2,3}[-]\d{2,3}[-]\d{2,3})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            raw = match.group(1).strip()
            cleaned = re.sub(r'[^0-9-]', '', raw)
            if len(cleaned) >= 6 and '-' in cleaned:
                return cleaned
            parts = re.findall(r'\d+', raw)
            if len(parts) == 3:
                return f"{parts[0]}-{parts[1]}-{parts[2]}"
    return None


def scan_with_text(pdf_bytes: bytes) -> dict:
    text = extract_text_from_pdf(pdf_bytes)
    if len(text) < 50:
        return {"method": "text", "success": False, "reason": "no_text"}

    apn = parse_apn_from_text(text)
    return {
        "method": "text",
        "success": apn is not None,
        "apn_from_log": apn,
        "raw_text_length": len(text),
    }


def scan_with_claude(pdf_bytes: bytes, well_id: str) -> dict:
    if not HAS_ANTHROPIC:
        return {"method": "claude", "success": False, "reason": "anthropic_not_installed"}

    client = anthropic.Anthropic()
    image_b64 = pdf_to_image_base64(pdf_bytes)

    prompt = """This is a scanned Nevada well driller's report (well log). Extract the following fields exactly as written on the form. If a field is not visible or illegible, respond with "N/A".

Return ONLY a JSON object with these fields:
{
  "apn": "the Assessor's Parcel Number (APN), format like 003-331-10",
  "owner": "property owner name",
  "address": "street address at well location if visible",
  "drill_depth": "total depth drilled in feet (number only)",
  "static_water_level": "static water level in feet (number only)",
  "completion_date": "date completed MM/DD/YYYY",
  "driller_name": "driller name",
  "latitude": "latitude if shown",
  "longitude": "longitude if shown",
  "permit_number": "permit or waiver number if shown",
  "confidence": "high/medium/low - your confidence in the APN reading"
}"""

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )

        text = response.content[0].text
        json_match = re.search(r'\{[^}]+\}', text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            return {
                "method": "claude",
                "success": result.get("apn") not in (None, "N/A", ""),
                **result,
            }
        return {"method": "claude", "success": False, "reason": "no_json_in_response", "raw": text}
    except Exception as e:
        return {"method": "claude", "success": False, "reason": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Scan well log PDFs")
    parser.add_argument("--text-only", action="store_true", help="Only scan digital PDFs (free)")
    parser.add_argument("--well", type=str, help="Scan a single well by ID")
    parser.add_argument("--limit", type=int, help="Max wells to scan")
    parser.add_argument("--force", action="store_true", help="Re-scan already scanned wells")
    args = parser.parse_args()

    with open(WELLS_PATH) as f:
        wells = json.load(f)

    existing_results: dict = {}
    if SCAN_RESULTS_PATH.exists():
        with open(SCAN_RESULTS_PATH) as f:
            existing_results = json.load(f)

    if args.well:
        targets = [w for w in wells if w["id"] == args.well]
        if not targets:
            print(f"Well {args.well} not found")
            sys.exit(1)
    else:
        targets = wells

    if not args.force:
        targets = [w for w in targets if w["id"] not in existing_results]

    if args.limit:
        targets = targets[:args.limit]

    print(f"Scanning {len(targets)} wells...")
    if not HAS_ANTHROPIC and not args.text_only:
        print("WARNING: anthropic package not installed. Install with: pip3 install anthropic")
        print("Only text extraction will work. Use --text-only or install anthropic.\n")

    scanned = 0
    text_success = 0
    claude_success = 0
    errors = 0

    for i, w in enumerate(targets):
        well_id = w["id"]
        year = int(w["completionDate"].split("/")[2]) if w.get("completionDate") else 0
        is_digital = year >= 2020

        if args.text_only and not is_digital:
            continue

        print(f"[{i+1}/{len(targets)}] Well #{well_id} ({year})...", end=" ", flush=True)

        url = pdf_url(well_id)
        pdf_bytes = download_pdf(url)
        if not pdf_bytes:
            existing_results[well_id] = {"success": False, "reason": "download_failed"}
            errors += 1
            continue

        if HAS_ANTHROPIC:
            result = scan_with_claude(pdf_bytes, well_id)
            if result["success"]:
                claude_success += 1
                print(f"APN: {result.get('apn')} | {result.get('address', '')} (confidence: {result.get('confidence', '?')})")
            else:
                print(f"FAILED: {result.get('reason', 'unknown')}")
                errors += 1
        else:
            print("SKIP (no anthropic)")
            continue

        existing_results[well_id] = result
        scanned += 1

        with open(SCAN_RESULTS_PATH, "w") as f:
            json.dump(existing_results, f, indent=2)

        if not is_digital and HAS_ANTHROPIC:
            time.sleep(0.5)

    print(f"\nDone. Scanned: {scanned}, Text: {text_success}, Claude: {claude_success}, Errors: {errors}")
    print(f"Results saved to {SCAN_RESULTS_PATH}")


if __name__ == "__main__":
    main()
