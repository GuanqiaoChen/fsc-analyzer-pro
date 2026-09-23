"""Convert the assignment's official DLA FSC reference once; never run at runtime.

Read Table 1 only; Table 2 repeats the same records alphabetically. RIC/ACTY
codes and the '**' source-of-supply footnote marker are not part of class titles.
"""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re

import httpx
import pymupdf

SOURCE_URL = "https://www.dla.mil/Portals/104/Documents/Aviation/AviationEngineering/Engineering/AV_FSCClassAssignment._151007.pdf"
OUTPUT = Path(__file__).resolve().parents[1] / "backend/app/data/fsc_codes.json"


def parse_catalog(content: bytes) -> list[dict[str, str]]:
    pages = []
    with pymupdf.open(stream=content, filetype="pdf") as document:
        for page in document:
            text = page.get_text()
            if text.lstrip().startswith("Table 2"):
                break
            pages.append(text)
    text = "\n".join(pages)
    rows = re.findall(r"(?m)^\s*([0-9]{4})\s*\n(.*?)(?=\n\s*[A-Z0-9]{3}(?:[/\-][A-Z0-9-]+)?[ ]*\n)", text, re.S)
    records = {code: " ".join(title.replace("**", "").split()) for code, title in rows}
    source_codes = set(re.findall(r"(?m)^\s*([0-9]{4})\s*$", text))
    if set(records) != source_codes or len(rows) != len(records) or len(records) != 580:
        raise ValueError("Unexpected table layout or record count; review source before replacing catalog.")
    if records.get("4010") != "Chain and Wire Rope":
        raise ValueError("Reference title sanity check failed.")
    return [{"code": code, "description": title} for code, title in sorted(records.items())]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, help="Use the supplied AV_FSCClassAssignment._151007.pdf")
    args = parser.parse_args()
    if args.pdf:
        content = args.pdf.read_bytes()
    else:
        response = httpx.get(SOURCE_URL, timeout=60, follow_redirects=True)
        response.raise_for_status()
        content = response.content
    records = parse_catalog(content)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    metadata = {"publisher": "Defense Logistics Agency", "title": "Federal Supply Class Assignments to DLA/GSA, Table 1",
                "source_file": "AV_FSCClassAssignment._151007.pdf", "source_url": SOURCE_URL, "converted_on": date.today().isoformat(),
                "source_sha256": hashlib.sha256(content).hexdigest(), "record_count": len(records),
                "note": "Converted from the exact assignment-supplied PDF. Static reference; covers the listed DLA/GSA assignments."}
    OUTPUT.with_name("fsc_catalog_source.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} official FSC records to {OUTPUT}")


if __name__ == "__main__":
    main()
