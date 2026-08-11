#!/usr/bin/env python3
"""Inspect the public PTXPhish XLSX corpus without third-party Python packages.

This utility is calibration infrastructure only. It downloads the upstream
workbook at runtime, parses XLSX XML, and emits headers plus a bounded sample so
we can design a leakage-safe real-world blind importer without committing the
third-party dataset to this repository.
"""
from __future__ import annotations

import json
import os
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

URL = os.environ.get(
    "PTXPHISH_XLSX_URL",
    "https://raw.githubusercontent.com/blocksecteam/PTXPhish/main/dataset/PTXPHISH.xlsx",
)
OUT = Path("artifacts/ptxphish-inspection")
XLSX = OUT / "PTXPHISH.xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
DOC_REL_NS = {"r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def download() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(URL, headers={"User-Agent": "Tri-Proof-Calibration/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read()
    if len(body) < 1_000:
        raise RuntimeError(f"PTXPhish download unexpectedly small: {len(body)} bytes")
    XLSX.write_bytes(body)


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(path))
    values: list[str] = []
    for item in root.findall("m:si", NS):
        values.append("".join(node.text or "" for node in item.findall(".//m:t", NS)))
    return values


def workbook_sheets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("r:Relationship", REL_NS)}
    result: list[tuple[str, str]] = []
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        name = sheet.attrib.get("name", "sheet")
        rid = sheet.attrib.get(f"{{{DOC_REL_NS['r']}}}id", "")
        target = targets.get(rid, "")
        if target.startswith("/"):
            target = target.lstrip("/")
        elif not target.startswith("xl/"):
            target = f"xl/{target}"
        result.append((name, target))
    return result


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
    value = cell.find("m:v", NS)
    raw = value.text if value is not None and value.text is not None else ""
    if cell_type == "s" and raw.isdigit():
        index = int(raw)
        return strings[index] if index < len(strings) else raw
    return raw


def inspect() -> dict:
    with zipfile.ZipFile(XLSX) as zf:
        strings = shared_strings(zf)
        sheets = workbook_sheets(zf)
        result = {"source": URL, "sizeBytes": XLSX.stat().st_size, "sheets": []}
        for name, target in sheets:
            if target not in zf.namelist():
                continue
            root = ET.fromstring(zf.read(target))
            rows = root.findall(".//m:sheetData/m:row", NS)
            parsed: list[list[str]] = []
            for row in rows[:8]:
                parsed.append([cell_value(cell, strings) for cell in row.findall("m:c", NS)])
            result["sheets"].append({
                "name": name,
                "xmlPath": target,
                "rowCount": len(rows),
                "sampleRows": parsed,
            })
        return result


def main() -> None:
    download()
    report = inspect()
    (OUT / "inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
