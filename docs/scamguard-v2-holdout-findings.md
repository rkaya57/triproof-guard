# ScamGuard V2 Post-Holdout Calibration Findings

## Status

The original 150-case Holdout is now **seen calibration data** and must never be reused as final validation. The frozen Holdout branch remains untouched. All post-Holdout changes live on `feat/risk-engine-v2-calibration` and PR #87 remains draft.

## Production-aligned seen-set replay

Latest replay is diagnostic only and not activation evidence.

- Total fixture cases: 150
- Scored cases: 150
- Unresolved transactions: 0
- V1 strict TP: 14
- V2 strict TP: 14
- V1 recall: 18.67%
- V2 decisive recall: 34.15%
- V1 FNR: 81.33%
- V2 FNR: 65.85%
- V1/V2 FPR after production URL guard: 32.26%
- Malicious evidence coverage: 54.67%
- Source-diverse malicious coverage: 0%
- Transaction source-context coverage in the historical fixture: 0%

The recall improvement is **not** an increase in strict HIGH_RISK/CRITICAL true positives. It primarily reflects malicious cases moving from `SAFE` to `CAUTION/review`. Strict TP remains 14. This distinction is mandatory in all activation discussions.

## Production URL behavior

The replay now mirrors the production URL route by applying `applyVerifiedDomainFalsePositiveGuard` after the base engine scan. Two historical official-domain false positives are corrected in the replay. Verified-domain trust only suppresses known registry-gap heuristics; independent threat-feed, known-bad, seed/private-key, obfuscation and other stop-level signals remain non-downgradable.

## External EVM threat coverage

Calibration now supports separately controlled evidence source groups for:

- Real-CATS criminal Ethereum corpus (`master` branch feed)
- validated Ethereum rug-pull dataset
- MyEtherWallet address darklist
- optional GoPlus malicious-address security
- live EVM RPC contract-integrity context

Single external source matches remain review-only. HIGH_RISK requires source-diverse corroboration. GoPlus is fail-safe disabled without `GOPLUS_APP_KEY` and `GOPLUS_APP_SECRET`; no network call is made when credentials are absent.

The seen 150-case fixture currently does not contain cross-corpus overlap sufficient to raise source-diverse malicious coverage above zero. Adding more source groups must not be treated as corroboration unless the same target is independently confirmed by distinct provenance chains.

## Transaction context

The browser/extension flow already supplies `sourceUrl` into transaction scanning. V2 shadow evaluation now receives that origin context after the production response without changing the V1 decision or consuming a second user scan quota. Privacy telemetry stores only aggregate decision/evidence metadata, never source URLs or raw signing payloads.

Regression coverage proves that phishing/brand context plus a dangerous unlimited approval can form source-diverse CRITICAL shadow evidence, while ordinary transfers and limited approvals do not self-escalate.

## Second Holdout contract

Final validation must use a completely new dataset. Current minimum contract:

- at least 180 total cases
- at least 8 projects/contexts
- both Solana and EVM
- URL >= 40
- token >= 40
- transaction >= 50
- wallet >= 30
- benign >= 60
- malicious >= 60
- transaction source-context coverage >= 80%
- verified ground-truth coverage >= 90%
- malicious dual-source ground-truth coverage >= 50%
- executable target required on every row
- valid evidence URL required on every row
- unique provenance ID required on every row
- all original seen fixture IDs prohibited
- internal Tri-Proof adjudication and graph evidence excluded

A dataset that satisfies row counts but cannot be replayed or independently verified is rejected by the validator.

## Activation status

**NOT READY FOR PRODUCTION ACTIVATION.**

Required before activation:

1. Increase source-diverse malicious coverage with genuinely independent evidence, not duplicated upstream data.
2. Validate real transaction-origin coverage on the new dataset.
3. Collect and freeze the new 180+ case second Holdout.
4. Run V1 versus calibration-candidate evaluation with 100% resolvable final-validation cases.
5. Review strict TP/FP/FN metrics separately from CAUTION/review-rate changes.
6. Only then consider shadow-to-production activation.
