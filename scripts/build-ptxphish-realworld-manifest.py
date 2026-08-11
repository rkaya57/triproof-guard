#!/usr/bin/env python3
"""Build a deterministic, leakage-resistant PTXPhish transaction manifest.

The upstream workbook is downloaded at runtime and never vendored. Selection is
based only on upstream category, transaction-hash validity, source availability,
and a deterministic SHA-256 ordering. No ScamGuard output is consulted.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

URL = os.environ.get(
    "PTXPHISH_XLSX_URL",
    "https://raw.githubusercontent.com/blocksecteam/PTXPhish/main/dataset/PTXPHISH.xlsx",
)
OUT = Path("artifacts/ptxphish-realworld")
XLSX = OUT / "PTXPHISH.xlsx"
MANIFEST = OUT / "manifest.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
HTTP_RE = re.compile(r"https?://[^\s]+", re.I)

# Pairs observed in PTXPHISH.xlsx row 4. We intentionally select transaction
# categories that map to signing/transaction risk surfaces supported by ScamGuard.
CATEGORY_COLUMNS = {
    "approve": (0, 1),
    "permit": (2, 3),
    "set_approval_for_all": (4, 5),
    "bulk_transfer": (7, 8),
    "proxy_upgrade": (9, 10),
    "free_buy_order": (11, 12),
    "zero_value_transfer": (14, 15),
    "fake_token_transfer": (16, 17),
    "dust_value_transfer": (18, 19),
    "airdrop_function": (21, 22),
    "wallet_function": (23, 24),
}
TARGET_CASES = int(os.environ.get("PTXPHISH_TARGET_CASES", "120"))
MIN_PER_CATEGORY = int(os.environ.get("PTXPHISH_MIN_PER_CATEGORY", "6"))


def download() -> bytes:
    OUT.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(URL, headers={"User-Agent": "Tri-Proof-Blind-Validation/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read()
    if len(body) < 100_000:
        raise RuntimeError(f"PTXPhish download unexpectedly small: {len(body)} bytes")
    XLSX.write_bytes(body)
    return body


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(path))
    return ["".join(node.text or "" for node in item.findall(".//m:t", NS)) for item in root.findall("m:si", NS)]


def col_index(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha()).upper()
    value = 0
    for ch in letters:
        value = value * 26 + (ord(ch) - 64)
    return value - 1


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


def parse_rows() -> list[dict[int, str]]:
    with zipfile.ZipFile(XLSX) as zf:
        strings = shared_strings(zf)
        root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        result: list[dict[int, str]] = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            row_values: dict[int, str] = {}
            for cell in row.findall("m:c", NS):
                ref = cell.attrib.get("r", "")
                if not ref:
                    continue
                row_values[col_index(ref)] = cell_value(cell, strings).strip()
            result.append(row_values)
        return result


def normalize_source(raw: str) -> str | None:
    match = HTTP_RE.search(raw or "")
    if not match:
        return None
    return match.group(0).rstrip(").,;\"'")


def deterministic_key(item: dict[str, str]) -> str:
    seed = f"ptxphish-v1|{item['category']}|{item['txHash']}|{item['sourceUrl']}"
    return hashlib.sha256(seed.encode()).hexdigest()


def main() -> None:
    body = download()
    rows = parse_rows()
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()

    # First four rows are the workbook title/group/category header rows.
    for row in rows[4:]:
        for category, (tx_col, source_col) in CATEGORY_COLUMNS.items():
            tx_hash = row.get(tx_col, "").lower()
            source = normalize_source(row.get(source_col, ""))
            if not TX_RE.fullmatch(tx_hash) or not source or tx_hash in seen:
                continue
            seen.add(tx_hash)
            candidates.append({
                "txHash": tx_hash,
                "category": category,
                "sourceUrl": source,
                "upstream": URL,
            })

    by_category: dict[str, list[dict[str, str]]] = {name: [] for name in CATEGORY_COLUMNS}
    for item in sorted(candidates, key=deterministic_key):
        by_category[item["category"]].append(item)

    selected: list[dict[str, str]] = []
    selected_hashes: set[str] = set()
    for category in CATEGORY_COLUMNS:
        for item in by_category[category][:MIN_PER_CATEGORY]:
            if item["txHash"] not in selected_hashes:
                selected.append(item)
                selected_hashes.add(item["txHash"])

    remaining = sorted(
        (item for item in candidates if item["txHash"] not in selected_hashes),
        key=deterministic_key,
    )
    for item in remaining:
        if len(selected) >= TARGET_CASES:
            break
        selected.append(item)
        selected_hashes.add(item["txHash"])

    selected = sorted(selected, key=deterministic_key)[:TARGET_CASES]
    if len(selected) < TARGET_CASES:
        raise RuntimeError(f"Only {len(selected)} source-backed PTXPhish transactions available; need {TARGET_CASES}")

    corpus_sha = hashlib.sha256(body).hexdigest()
    manifest_core = {
        "schemaVersion": 1,
        "selectionPolicy": "source-backed valid tx hashes; minimum-per-category then SHA-256 deterministic fill; no model outputs consulted",
        "upstreamUrl": URL,
        "upstreamSha256": corpus_sha,
        "targetCases": TARGET_CASES,
        "cases": selected,
    }
    canonical = json.dumps(manifest_core, separators=(",", ":"), sort_keys=True).encode()
    manifest_sha = hashlib.sha256(canonical).hexdigest()
    report = {
        **manifest_core,
        "manifestSha256": manifest_sha,
        "availableSourceBackedTransactions": len(candidates),
        "categoryAvailable": {k: len(v) for k, v in by_category.items()},
        "categorySelected": {k: sum(1 for item in selected if item["category"] == k) for k in CATEGORY_COLUMNS},
    }
    MANIFEST.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "manifestSha256": manifest_sha,
        "upstreamSha256": corpus_sha,
        "selected": len(selected),
        "availableSourceBackedTransactions": len(candidates),
        "categorySelected": report["categorySelected"],
    }, indent=2))


if __name__ == "__main__":
    main()
