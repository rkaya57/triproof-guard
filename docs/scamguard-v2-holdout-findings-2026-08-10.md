# ScamGuard V2 Holdout findings — 2026-08-10

Frozen runtime: `8561f45c72868ae75e8a5bcfeb554b964717d8ff`

## Frozen Holdout outcome

The provider-parity Holdout completed with 150/150 cases resolved. Provider parity was ready for Tokens.xyz, the phishing feed, Solana RPC, and EVM RPC. Effective frozen V2 metrics were identical to V1, so this frozen V2 candidate is not production-activation eligible.

Overall decisive metrics: precision 37.84%, recall 18.67%, false-positive rate 37.10%, false-negative rate 81.33%.

Surface diagnostics:
- URL: 80% accuracy, 86.67% recall, 26.67% false-positive rate.
- Token: 0% malicious recall and 73.33% false-positive rate.
- Transaction: 3.70% malicious recall; 24.07% review rate.
- Wallet: 0% malicious recall and 44.44% false-positive rate.

## Primary diagnosis

This is not primarily a threshold problem. Additive V2 produced no escalation on the original Holdout because evidence coverage was too sparse: most cases produced zero additive evidence and no case reached the required source-diverse corroboration gate.

The first Holdout dataset also exposed coverage mismatches that must not be used to tune the frozen candidate directly:
1. Malicious token controls are predominantly EVM while Tokens.xyz is a Solana-focused source in V2.
2. Historical transaction-hash controls do not preserve browser origin/sourceUrl context, even though pre-sign V2 is designed to combine transaction impact with origin/phishing/brand evidence.
3. Wallet Holdout cases have no independent external wallet-reputation source in V2 once internal adjudication and graph context are correctly excluded during Holdout.
4. The additive-only policy can improve threat review coverage but cannot reduce V1 false positives; canonical or infrastructure context therefore cannot improve the measured FPR until a separately validated de-risking policy or V1 false-positive fix exists.

## Post-Holdout calibration replay

The original 150-case fixture is now explicitly treated as **seen calibration data**, not as a second Holdout. A separate replay workflow records `seenDataset: true`, `activationEligible: false`, and `finalValidationEligible: false`.

Latest replay at calibration head `9387d2d73a34ac7a260c11c35f654008483ef109` scored 148/150 cases. Two historical Solana transaction hashes (`SGV2-HO-038`, `SGV2-HO-039`) could not be recovered from the bounded public archive RPC path; this is reported as replay incompleteness rather than silently substituting synthetic payloads.

Observed replay metrics:
- V1 decisive recall: 18.67%.
- Effective V2 decisive recall: 34.15%.
- V1 false-negative rate: 81.33%.
- Effective V2 false-negative rate: 65.85%.
- Malicious cases with any additive V2 evidence: 54.67%.
- Malicious cases with source-diverse additive evidence: 0%.
- Transaction evidence coverage: 3.85% (2/52 resolved transaction cases).
- Historical transaction sourceUrl/origin coverage: 0% (0/54 fixture transaction cases).

### Interpretation warning

The apparent recall improvement is primarily an **abstention/review improvement**, not a strict malicious-classification improvement. Strict true positives remained 14. V2 moved 34 malicious cases from SAFE to CAUTION/review, reducing silent false negatives among decisive predictions but not yet creating new HIGH_RISK/CRITICAL true positives. Therefore this replay does **not** establish activation readiness.

This distinction is intentional: a CAUTION result is useful because it interrupts unsafe continuation, but it must not be reported as equivalent to a confirmed malicious classification.

## Calibration changes completed

- Added public EVM threat-corpus evidence for token/wallet targets with source-level separation.
- Hardened corpus parsing so Real-CATS non-malicious labels and non-ETH rug-pull rows cannot become malicious evidence.
- Expanded local brand coverage for current Phantom, MetaMask, Uniswap, and Raydium official domains.
- Added transaction runtime V2 shadow evaluation after the production V1 response. `sourceUrl` is available to evidence fusion but is never emitted in shadow telemetry.
- Added explicit `sourceContextPresent`, provider-quality, and activation-source telemetry without raw target or signing payload retention.
- Added a seen-set calibration replay workflow with a 98% diagnostic completeness floor; replay results can never activate V2.
- Added an independent second-Holdout dataset contract requiring at least 180 fresh cases, 8 projects/contexts, balanced surfaces/classes, both Solana and EVM, and at least 80% real transaction source-context coverage.
- Added leakage protection so seen calibration IDs are prohibited from the second Holdout.

## Remaining blockers before a second freeze

1. Source-diverse malicious evidence coverage is still 0%; single-corpus EVM matches currently produce CAUTION rather than HIGH_RISK.
2. Transaction evidence coverage is still too low, and the old fixture cannot measure the new origin-aware path because it predates sourceUrl capture.
3. Strict malicious true positives have not increased on the seen replay.
4. Existing V1 false positives (including historical official-domain registry gaps such as current Phantom surfaces) cannot be reduced by the additive `max(V1, V2)` policy.
5. A genuinely fresh second-Holdout dataset has not yet been collected or frozen.

## Calibration rules

- Do not modify the frozen branch or reuse the first Holdout as unseen validation.
- Use the original 150 cases only for diagnosis and calibration replay.
- Preserve source-diversity requirements; do not lower HIGH/CRITICAL thresholds merely to improve headline recall.
- Do not count CAUTION/review as a strict malicious true positive.
- Before the next true Holdout, create a new freeze and collect a new unseen multi-surface dataset under the second-Holdout contract.
- No automatic V2 downgrade or production decision change before independent validation.
