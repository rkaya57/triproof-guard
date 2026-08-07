# Tri-Proof Labeled Benchmark Governance

## Purpose

The labeled benchmark measures whether the campaign-security engine makes defensible decisions on organic users, Sybil wallets, bot-like participants, non-user entities, and data-limited cases.

The benchmark separates two claims:

1. **Operational regression safety** — deterministic safety fixtures and semantic invariants still pass.
2. **Real-world accuracy readiness** — enough independently reviewed holdout data exists to publish precision, recall, false-positive, or false-negative claims.

Synthetic fixtures can pass the operational gate. They can never, by themselves, justify a public real-world accuracy claim.

## Ground-truth classes

- `organic_user` — a normal participant with no confirmed malicious coordination.
- `sybil` — a participant controlled as part of a coordinated multi-wallet operation.
- `bot` — automation materially responsible for campaign participation or abuse.
- `non_user_entity` — exchange, protocol, contract, program, treasury, bridge, service, or another account that is not an individual participant.
- `insufficient_data` — the available evidence cannot support a reliable participant-risk conclusion.

Ground truth separately records the expected campaign decision and whether malicious risk should be present, absent, or unknown. This prevents eligibility exclusions such as exchanges or protocol contracts from being mislabeled as malicious risk.

## Malicious-prediction definition

A case is counted as a malicious prediction only when it is not approved and at least one of these conditions is met:

- explicit strong malicious evidence exists, such as known-bad funding, self-referral, circular flow, high or very-high bot probability, or equivalent hard evidence;
- the wallet is linked to a suspicious cluster and at least two independent evidence families support the relationship.

Review-only evidence, such as moderate bot suspicion, young-wallet status, limited history, or low diversity, does not by itself become a malicious prediction.

## Provenance hierarchy

Every scenario declares one provenance kind:

- `verified_human` — independently reviewed real-world case with reviewer identity and review timestamp.
- `public_reference` — public entity or protocol reference with a traceable source.
- `synthetic_adversarial` — deliberately constructed evasion or attack scenario.
- `synthetic_regression` — deterministic safety and behavior fixture.

Unreviewed production outputs are candidates, not ground truth. Engine decisions must never be copied into benchmark labels.

## Real-world blind labeling v2

The v2 workflow separates **claim-eligible representative sampling** from **challenge/error-discovery sampling**.

### Representative cohort

Representative cases are selected without using engine status, risk score, risk level, cluster membership, graph score, or reason codes. Selection is deterministic and campaign-balanced: by default, a fixed number of wallets is sampled from each completed project/campaign group.

This cohort is the only production-derived cohort eligible to contribute to external accuracy-readiness counts.

### Challenge cohort

Challenge cases are selected using hidden engine-output stratification so false positives, false negatives, and edge cases can be discovered faster.

Challenge cases are useful for development, but **must never be used for an external accuracy claim**. The benchmark runner refuses `--require-claim-ready` when a compiled dataset contains `cohort:challenge` cases.

## Export workflow

Run:

```bash
npm run benchmark:labeling-queue
```

The exporter writes four gitignored local artifacts:

- `labeling-queue-representative-blind.csv` — claim-eligible reviewer queue.
- `labeling-queue-challenge-blind.csv` — non-claim error-discovery queue.
- `labeling-audit-map.csv` — sealed engine/input map. Do not expose it to reviewers before labels are frozen.
- `labeling-manifest.json` — sampling method, cohort counts, planned split counts, leakage controls, and SHA-256 hashes.

The reviewer-facing CSV intentionally excludes:

- engine status;
- risk score and risk level;
- cluster and graph score;
- engine reason codes;
- Tri-Proof entity classification;
- bot, behavior-diversity, reputation, and policy scores;
- raw internal project and analysis identifiers.

It includes observable evidence, the public wallet address, chain, campaign type, and an explorer link for independent verification.

## Review fields

Copy the selected blind queue to a reviewed file, for example:

```text
labeling-queue-representative-reviewed.csv
```

Complete every selected row:

- `ground_truth_label`
- `expected_decision`
- `acceptable_decisions`
- `malicious_risk_expectation`
- `reviewer`
- `reviewed_at`
- `review_confidence` (`high`, `medium`, or `low`)
- `rationale`
- optional `tags`

Representative rows with `low` review confidence do not compile as claim-eligible labels. If evidence is genuinely unresolved, use `insufficient_data` rather than manufacturing certainty.

Confirmed `sybil` and `bot` labels in the representative cohort require **two independent named reviewers** before compilation. Reviewer names are separated with `|` or `;`.

## Label freeze and sealed audit map

Reviewers must not open `labeling-audit-map.csv` while assigning labels. The audit map contains the frozen engine input snapshot and original engine output required for reproducibility and post-label comparison.

Only after all labels for the selected cohort are complete and frozen may the audit map be used by the compiler.

The compiler verifies:

- every reviewed case exists in the sealed audit map;
- chain, wallet address, scenario id, and split-group id match the sealed record;
- there are no missing or extra cases in the frozen cohort;
- representative malicious labels have two reviewers;
- reviewer confidence satisfies the claim-eligible standard.

## Compile reviewed representative labels

```bash
npm run benchmark:compile-reviewed -- \
  --cohort representative \
  --input artifacts/benchmark-labeling/labeling-queue-representative-reviewed.csv \
  --audit-map artifacts/benchmark-labeling/labeling-audit-map.csv \
  --version real-world-YYYY-MM-DD
```

The compiler groups labeled wallets by original campaign scenario rather than turning every wallet into an isolated one-wallet scenario.

### Full campaign context replay

Only sampled wallets have human labels and contribute to metrics. However, the compiler also restores the other unlabeled wallets from the same production campaign as `contextInputs`.

During benchmark execution the engine receives:

- all unlabeled campaign context wallets; and
- all human-labeled benchmark cases for that scenario.

Metrics are calculated only on the labeled cases. This preserves shared-funding, timing, referral, behavior, and graph/cluster relationships without pretending unlabeled wallets have ground truth.

## Split isolation

Real-world compilation assigns campaign/project split groups deterministically using a **20% development / 20% validation / 60% holdout** policy.

The holdout share is intentionally larger than a conventional model-training split because Tri-Proof already has synthetic and adversarial regression coverage; real human labels are expensive and are primarily needed for independent validation.

Related wallets from the same split group cannot land in different benchmark splits.

Do not deliberately move a known operator, funding tree, referral tree, campaign incident, or coordinated cluster across development and holdout data.

## Run the real-world benchmark

```bash
npm run benchmark:labeled -- \
  --dataset artifacts/benchmark-labeling/real-world-YYYY-MM-DD.json
```

Strict external-claim readiness:

```bash
npm run benchmark:labeled -- \
  --dataset artifacts/benchmark-labeling/real-world-YYYY-MM-DD.json \
  --require-claim-ready
```

Challenge datasets can be compiled separately for development, but are explicitly non-claim-eligible.

## Review standard

A real-world case must include:

- a traceable internal/public source reference;
- named reviewer identity;
- ISO-8601 review timestamp;
- written rationale;
- frozen engine-input snapshot sufficient to rerun the case;
- no unresolved conflict between label and expected decision.

Reviewer independence matters more than agreement. If two reviewers disagree, adjudicate the evidence without exposing the original engine prediction to the deciding reviewer.

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

A failed gate exits with a non-zero status and blocks the production build where the regression dataset is used.

## Real-world accuracy-claim gate

The benchmark does not mark Tri-Proof ready for external real-world accuracy claims until the holdout set contains at least:

- 100 real-world holdout cases;
- 30 real-world Sybil or bot cases;
- 30 real-world organic-user cases;
- two represented chains.

Meeting the count gate is necessary but not sufficient: the measured precision, recall, false-positive behavior, label provenance, and reviewer quality must still be disclosed accurately.

## Reported metrics

Reports include:

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

Reports are written to `artifacts/benchmark/` and can be uploaded by CI as short-lived artifacts.

## Data handling

- Benchmark labeling exports remain excluded from Git.
- Do not commit customer-specific raw exports or private review notes.
- Wallet addresses are public identifiers but remain operationally sensitive when tied to a customer campaign.
- Use only the minimum evidence needed for reproducibility.
- Never put reviewer email addresses, passwords, sessions, IP addresses, or raw device identifiers in benchmark files.
- Participant fingerprints must remain one-way values and are kept out of the reviewer-facing blind evidence.
- The sealed audit map must not be shared with reviewers before label freeze.

## Reference dataset

`data/benchmarks/reference-v1.json` remains the deterministic regression dataset. It validates benchmark mechanics and engine safety boundaries but is intentionally **not** a substitute for human-reviewed production holdout evidence.
