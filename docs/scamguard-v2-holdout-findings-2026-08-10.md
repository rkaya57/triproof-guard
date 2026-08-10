# ScamGuard V2 Holdout findings — 2026-08-10

Frozen runtime: `8561f45c72868ae75e8a5bcfeb554b964717d8ff`

## Outcome

The provider-parity Holdout completed with 150/150 cases resolved. Provider parity was ready for Tokens.xyz, the phishing feed, Solana RPC, and EVM RPC. Effective V2 metrics were identical to V1, so this frozen V2 candidate is not production-activation eligible.

Overall decisive metrics: precision 37.84%, recall 18.67%, false-positive rate 37.10%, false-negative rate 81.33%.

Surface diagnostics:
- URL: 80% accuracy, 86.67% recall, 26.67% false-positive rate.
- Token: 0% malicious recall and 73.33% false-positive rate.
- Transaction: 3.70% malicious recall; 24.07% review rate.
- Wallet: 0% malicious recall and 44.44% false-positive rate.

## Primary diagnosis

This is not primarily a threshold problem. Additive V2 produced no escalation on the Holdout because evidence coverage was too sparse: most cases produced zero additive evidence and no case reached the required source-diverse corroboration gate.

The first Holdout dataset also exposed coverage mismatches that must not be used to tune the frozen candidate directly:
1. Malicious token controls are predominantly EVM while Tokens.xyz is a Solana-focused source in V2.
2. Historical transaction-hash controls do not preserve browser origin/sourceUrl context, even though pre-sign V2 is designed to combine transaction impact with origin/phishing/brand evidence.
3. Wallet Holdout cases have no independent external wallet-reputation source in V2 once internal adjudication and graph context are correctly excluded during Holdout.
4. The additive-only policy can improve recall but cannot reduce V1 false positives; canonical or infrastructure context therefore cannot improve the measured FPR until a separately validated de-risking policy exists.

## Calibration rules

- Do not modify the frozen branch or reuse this Holdout as a new unseen test set.
- Use these results only for diagnosis and calibration on `feat/risk-engine-v2-calibration`.
- Build a separate validation set for iteration.
- Before the next true Holdout, create a new freeze and collect a new unseen multi-surface dataset.
- Preserve source-diversity requirements; do not lower HIGH/CRITICAL thresholds merely to improve recall.

## Next engineering targets

1. Add independent EVM token/wallet/counterparty threat intelligence.
2. Preserve and evaluate browser `sourceUrl`/origin with transaction controls.
3. Add chain-balanced malicious Solana token/wallet/transaction validation cases.
4. Introduce shadow-only de-risking evidence for canonical assets and strongly corroborated infrastructure; no automatic production downgrade before independent validation.
5. Add evidence-coverage telemetry as an explicit readiness metric: a candidate cannot be activation-ready if the majority of target cases generate no V2 evidence.
