# Tri-Proof Labeled Benchmark Governance

## Purpose

The labeled benchmark measures whether the campaign-security engine makes defensible decisions on organic users, Sybil wallets, bot-like participants, non-user entities, and data-limited cases.

The benchmark separates two claims:

1. **Operational regression safety** — the engine still satisfies deterministic safety fixtures and semantic invariants.
2. **Real-world accuracy readiness** — there is enough independently reviewed holdout data to publish precision, recall, or false-positive claims.

Synthetic fixtures can pass the operational gate. They can never, by themselves, justify a public real-world accuracy claim.

## Ground-truth classes

- `organic_user` — a normal participant with no confirmed malicious coordination.
- `sybil` — a participant controlled as part of a coordinated multi-wallet operation.
- `bot` — automation materially responsible for campaign participation or abuse.
- `non_user_entity` — exchange, protocol, contract, program, treasury, bridge, service, or another account that is not an individual participant.
- `insufficient_data` — the available evidence cannot support a reliable participant-risk conclusion.

Ground truth also records the expected campaign decision and whether malicious risk should be present, absent, or unknown. This prevents a non-user eligibility exclusion from being counted as malicious risk.

## Malicious-prediction definition

A case is counted as a malicious prediction only when it is not approved and at least one of these conditions is met:

- explicit strong malicious evidence exists, such as known-bad funding, self-referral, circular flow, high or very-high bot probability, or equivalent hard evidence;
- the wallet is linked to a suspicious cluster and at least two independent evidence families support the relationship.

Review-only evidence, such as moderate bot suspicion, young-wallet status, limited history, or low diversity, does not by itself become a malicious prediction. This prevents Gray Zone cases from inflating false-positive counts while preserving corroborated cluster detection.

## Provenance hierarchy

Every scenario must declare one provenance kind:

- `verified_human` — reviewed real-world case with reviewer identity and review timestamp.
- `public_reference` — public entity or protocol reference with a traceable source.
- `synthetic_adversarial` — deliberately constructed evasion or attack scenario.
- `synthetic_regression` — deterministic safety and behavior fixture.

Unreviewed production outputs are candidate examples, not ground truth. Engine decisions must never be copied directly into the benchmark label column.

## Blind labeling workflow

1. Export a stratified candidate queue:

   ```bash
   npm run benchmark:labeling-queue
   ```

2. The exporter creates two local, gitignored files:

   - `labeling-queue-blind.csv` — reviewer-facing cases without engine status or risk score.
   - `labeling-audit-map.csv` — separate engine-output map used only after labels are locked.

3. Rename the completed blind file to `labeling-queue-reviewed.csv` and fill all required columns:

   - `ground_truth_label`
   - `expected_decision`
   - `acceptable_decisions`
   - `malicious_risk_expectation`
   - `reviewer`
   - `reviewed_at`
   - `rationale`

4. Compile and validate the reviewed labels:

   ```bash
   npm run benchmark:compile-reviewed -- \
     --input artifacts/benchmark-labeling/labeling-queue-reviewed.csv \
     --version real-world-YYYY-MM-DD
   ```

5. Run the benchmark:

   ```bash
   npm run benchmark:labeled -- \
     --dataset artifacts/benchmark-labeling/real-world-YYYY-MM-DD.json
   ```

6. Only after labels are frozen may the reviewer compare them with `labeling-audit-map.csv`.

## Review standard

A real-world case must include:

- a traceable source reference;
- at least one named reviewer;
- an ISO-8601 review timestamp;
- a written rationale;
- a complete engine-input snapshot sufficient to rerun the case;
- no unresolved conflict between the label and expected decision.

Before publishing external accuracy claims, confirmed Sybil and bot cases should receive two independent reviews. Disagreements must be adjudicated without exposing the engine prediction to the deciding reviewer.

## Leakage prevention

The compiler deterministically assigns scenarios to development, validation, and holdout splits. Related wallets must share the same scenario or campaign grouping key so that one cluster cannot appear across multiple splits.

Do not split individual wallets from the same suspected operator, funder, referral tree, campaign incident, or coordinated cluster across development and holdout data. That would inflate measured accuracy.

## Operational gate

The default operational gate requires:

- at least 12 benchmark cases;
- at least 95% acceptable-decision accuracy;
- at least 90% malicious precision;
- at least 90% malicious recall;
- 100% containment of labeled malicious cases;
- zero malicious wallets automatically approved;
- no more than 3% organic false rejects;
- 100% accuracy among high-confidence benchmark decisions;
- zero malicious-risk leakage for non-user and provider-limited cases;
- all scenario-level cluster expectations satisfied.

A failed gate exits with a non-zero status and blocks the production build.

## Real-world accuracy-claim gate

The benchmark refuses to mark the project ready for external real-world accuracy claims until the holdout set contains at least:

- 100 real-world cases;
- 30 real-world Sybil or bot cases;
- 30 real-world organic-user cases;
- two represented chains.

Run the strict gate with:

```bash
npm run benchmark:labeled -- \
  --dataset <real-world-dataset.json> \
  --require-claim-ready
```

## Reported metrics

The JSON and Markdown reports include:

- acceptable and exact decision accuracy;
- malicious precision, recall, and F1;
- malicious containment rate;
- critical false approvals;
- organic false-reject rate;
- manual-review rate;
- high-confidence decision accuracy;
- semantic risk-leakage counts;
- per-chain metrics;
- development, validation, and holdout metrics;
- decision confusion matrix;
- operational-gate checks;
- real-world claim-readiness deficiencies.

Reports are written to `artifacts/benchmark/` and uploaded by GitHub Actions for 30 days.

## Data handling

- Benchmark labeling exports are excluded from Git.
- Do not commit customer-specific raw exports or private review notes.
- Wallet addresses are public identifiers but must still be treated as operationally sensitive when tied to customer campaigns.
- Use only the minimum evidence needed for reproducibility.
- Never use reviewer email addresses, passwords, session identifiers, IP addresses, or raw device identifiers in benchmark data.
- Participant fingerprints must remain one-way values.

## Reference dataset

`data/benchmarks/reference-v1.json` validates the benchmark framework and engine safety boundaries. It includes deterministic synthetic controls and a small number of public non-user references.

It is intentionally marked **not ready** for real-world accuracy claims. Its purpose is to prevent regression while verified human labels are collected.
