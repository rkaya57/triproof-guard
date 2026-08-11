#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SOURCE_MALICIOUS = Path("phishinghook-malicious-contracts.txt")
SOURCE_BENIGN = Path("phishinghook-benign-contracts.txt")
OUT_DIR = Path("artifacts/phishinghook-transaction-holdout")
BLOCKSCOUT = os.environ.get("BLOCKSCOUT_BASE", "https://eth.blockscout.com")
TARGET_PER_CLASS = int(os.environ.get("PHISHINGHOOK_TARGET_PER_CLASS", "100"))
MAX_SOURCE_PER_CLASS = int(os.environ.get("PHISHINGHOOK_MAX_SOURCE_PER_CLASS", "500"))
REQUEST_SLEEP = float(os.environ.get("PHISHINGHOOK_REQUEST_SLEEP", "0.06"))
EXPECTED_MALICIOUS_SHA = "e70c83fc77943862681cafc096676416fbdf55257dff834d969281c4ee651061"
EXPECTED_BENIGN_SHA = "29f6f38bdde36c4d756d61a399bc0172402702946ef883ca525178fe9f03e417"

@dataclass(frozen=True)
class SourceContract:
    address: str
    ground_truth: str


def sha_text(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stable_key(value: str) -> str:
    return hashlib.sha256(value.lower().encode()).hexdigest()


def read_source(path: Path, expected_sha: str, label: str) -> list[SourceContract]:
    actual = sha_text(path)
    if actual != expected_sha:
        raise RuntimeError(f"{label} normalized source SHA drift: {actual}")
    rows = [line.strip().lower() for line in path.read_text().splitlines() if line.strip()]
    if len(rows) != len(set(rows)):
        raise RuntimeError(f"{label} source contains duplicate addresses")
    return [SourceContract(address=row, ground_truth=label) for row in sorted(rows, key=stable_key)]


def get_json(url: str, attempts: int = 4) -> Any:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "Tri-Proof-ScamGuard-Holdout-Collector/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"GET failed after {attempts} attempts: {url}: {last}")


def tx_hash(row: dict[str, Any]) -> str | None:
    value = row.get("hash")
    if isinstance(value, str) and value.startswith("0x") and len(value) == 66:
        return value.lower()
    return None


def address_hash(value: Any) -> str | None:
    if isinstance(value, str):
        return value.lower()
    if isinstance(value, dict):
        candidate = value.get("hash")
        if isinstance(candidate, str):
            return candidate.lower()
    return None


def usable_transaction(row: dict[str, Any], contract: str) -> bool:
    if tx_hash(row) is None:
        return False
    to_address = address_hash(row.get("to"))
    if to_address != contract:
        return False
    status = row.get("status")
    if isinstance(status, str) and status.lower() not in {"ok", "success", "1"}:
        return False
    if status is False:
        return False
    method = row.get("method")
    raw_input = row.get("raw_input") or row.get("input")
    if not isinstance(raw_input, str) or not raw_input.startswith("0x"):
        # A plain ETH transfer can still be a valid inbound interaction.
        raw_input = "0x"
    if not isinstance(row.get("from"), (str, dict)):
        return False
    return True


def canonical_tx(row: dict[str, Any], contract: str, label: str) -> dict[str, Any]:
    raw_input = row.get("raw_input") or row.get("input")
    if not isinstance(raw_input, str) or not raw_input.startswith("0x"):
        raw_input = "0x"
    from_address = address_hash(row.get("from"))
    block_number = row.get("block")
    if not isinstance(block_number, int):
        block_number = row.get("block_number") if isinstance(row.get("block_number"), int) else None
    return {
        "txHash": tx_hash(row),
        "groundTruth": label,
        "contract": contract,
        "from": from_address,
        "to": contract,
        "input": raw_input.lower(),
        "selector": raw_input[:10].lower() if len(raw_input) >= 10 else raw_input.lower(),
        "value": str(row.get("value") or "0"),
        "blockNumber": block_number,
        "blockTimestamp": row.get("timestamp"),
        "method": row.get("method"),
        "source": f"{BLOCKSCOUT}/tx/{tx_hash(row)}",
    }


def fetch_candidate(contract: SourceContract) -> dict[str, Any] | None:
    encoded = urllib.parse.quote(contract.address, safe="")
    url = f"{BLOCKSCOUT}/api/v2/addresses/{encoded}/transactions"
    payload = get_json(url)
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return None
    usable = [row for row in items if isinstance(row, dict) and usable_transaction(row, contract.address)]
    if not usable:
        return None
    # Selection is deterministic and model-independent. Hash order prevents
    # Blockscout's presentation order from becoming an implicit selection rule.
    usable.sort(key=lambda row: stable_key(tx_hash(row) or ""))
    return canonical_tx(usable[0], contract.address, contract.ground_truth)


def collect(source: list[SourceContract], target: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    selected: list[dict[str, Any]] = []
    stats = {"examinedContracts": 0, "contractsWithUsableTransaction": 0, "fetchErrors": 0}
    for contract in source[:MAX_SOURCE_PER_CLASS]:
        if len(selected) >= target:
            break
        stats["examinedContracts"] += 1
        try:
            row = fetch_candidate(contract)
        except Exception as exc:
            stats["fetchErrors"] += 1
            print(json.dumps({"warning": "blockscout_fetch_failed", "contract": contract.address, "error": str(exc)}))
            time.sleep(REQUEST_SLEEP)
            continue
        if row:
            stats["contractsWithUsableTransaction"] += 1
            selected.append(row)
        time.sleep(REQUEST_SLEEP)
    return selected, stats


def main() -> None:
    malicious_source = read_source(SOURCE_MALICIOUS, EXPECTED_MALICIOUS_SHA, "malicious")
    benign_source = read_source(SOURCE_BENIGN, EXPECTED_BENIGN_SHA, "benign")
    malicious, malicious_stats = collect(malicious_source, TARGET_PER_CLASS)
    benign, benign_stats = collect(benign_source, TARGET_PER_CLASS)
    if len(malicious) < TARGET_PER_CLASS or len(benign) < TARGET_PER_CLASS:
        raise RuntimeError(
            f"Insufficient real transactions: malicious={len(malicious)}/{TARGET_PER_CLASS}, benign={len(benign)}/{TARGET_PER_CLASS}"
        )
    all_rows = malicious + benign
    hashes = [row["txHash"] for row in all_rows]
    contracts = [row["contract"] for row in all_rows]
    if len(hashes) != len(set(hashes)):
        raise RuntimeError("Holdout contains duplicate transaction hashes")
    if len(contracts) != len(set(contracts)):
        raise RuntimeError("Holdout contains duplicate contracts")
    cross_contracts = set(row["contract"] for row in malicious) & set(row["contract"] for row in benign)
    if cross_contracts:
        raise RuntimeError("Holdout contains cross-class contract overlap")

    manifest_core = {
        "schemaVersion": 1,
        "evaluationRole": "fresh_independent_phishinghook_transaction_holdout",
        "activationEligibleAtCollection": False,
        "selection": {
            "source": "PhishingHook DSN 2025 Zenodo record 15076626",
            "sourceArtifactSha256": "a3a0adf6b344e142a84e7106b01389c483af710f7ddacc6bebbde8f322fdaf6d",
            "uniqueContractsArchiveSha256": "dbfe72489e5b92030b87c05d8331c4ffa21dc81109880d1ad54e6d911ccd8368",
            "maliciousNormalizedSourceSha256": EXPECTED_MALICIOUS_SHA,
            "benignNormalizedSourceSha256": EXPECTED_BENIGN_SHA,
            "contractOrdering": "sha256(lowercase contract address)",
            "transactionSelection": "sha256(transaction hash) minimum among first Blockscout page of successful inbound calls",
            "modelOutputUsedForSelection": False,
        },
        "cases": [
            {
                "txHash": row["txHash"],
                "groundTruth": row["groundTruth"],
                "contract": row["contract"],
                "selector": row["selector"],
            }
            for row in all_rows
        ],
    }
    manifest_sha = hashlib.sha256(json.dumps(manifest_core, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    report = {
        **manifest_core,
        "manifestSha256": manifest_sha,
        "counts": {"malicious": len(malicious), "benign": len(benign), "total": len(all_rows)},
        "collectionStats": {"malicious": malicious_stats, "benign": benign_stats},
        "selectorCounts": {
            "malicious": _counts(row["selector"] for row in malicious),
            "benign": _counts(row["selector"] for row in benign),
        },
        "details": all_rows,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2))
    (OUT_DIR / "manifest.json").write_text(json.dumps({**manifest_core, "manifestSha256": manifest_sha}, indent=2))
    print(json.dumps({
        "evaluationRole": report["evaluationRole"],
        "manifestSha256": manifest_sha,
        "counts": report["counts"],
        "collectionStats": report["collectionStats"],
        "topMaliciousSelectors": sorted(report["selectorCounts"]["malicious"].items(), key=lambda kv: (-kv[1], kv[0]))[:12],
        "topBenignSelectors": sorted(report["selectorCounts"]["benign"].items(), key=lambda kv: (-kv[1], kv[0]))[:12],
    }, indent=2))


def _counts(values):
    out: dict[str, int] = {}
    for value in values:
        out[value] = out.get(value, 0) + 1
    return out


if __name__ == "__main__":
    main()
