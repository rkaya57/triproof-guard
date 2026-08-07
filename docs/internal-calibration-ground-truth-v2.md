# Internal Calibration Ground-Truth v2

This note documents the evidence-only adjudication used for the claim-ineligible batch `29290c83d8a156f2199e`.

## Outcome

After the evidence-sufficiency fix, 19 decision mismatches remained. They were split into four groups:

- 10 historical unresolved Solana accounts: behavior can remain organic, but present reward eligibility requires manual review.
- 3 short-observation Solana wallets: evidence is insufficient for automatic approval and does not independently prove malicious behavior.
- 3 coordination candidates: shared-funding / closely aligned cohort evidence prevents automatic approval but is not by itself a confirmed Sybil label.
- 3 legacy Helius 1,000-signature snapshots: preserve organic/approved ground truth and normalize replay semantics instead of relabeling them.

## Legacy Helius replay rule

Older Helius enrichment returned at most 1,000 signatures and did not persist `historyTruncated`. For claim-ineligible internal calibration only, an input with all of the following is treated as truncated during replay:

- chain is Solana
- enrichment provider is Helius
- `txCount === 1000`
- `historyTruncated` is missing or null

This prevents the current engine from interpreting an observed first-seen timestamp as complete wallet history when the historical provider response was capped.

This rule does not alter production enrichment, risk thresholds, ordinary benchmark datasets, or public-claim eligibility.
