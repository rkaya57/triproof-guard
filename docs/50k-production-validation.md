# 50,000-wallet production validation

This deployment validates the high-volume Solana analysis path with real public on-chain data.

## Execution

1. The production build verifies Helius active-wallet pagination and real wallet enrichment.
2. The authorized analysis worker reserves the one-time internal validation project.
3. Exactly 50,000 unique active Solana signer addresses are collected from recent Jupiter, Raydium, and Orca program transactions.
4. Addresses are partitioned into 200 durable batches of 250 wallets.
5. Every wallet receives bounded oldest/newest real transaction screening and account classification.
6. Failed provider calls are retried and never converted into Sybil findings.
7. The scalable graph and risk engines finalize results and persist audit metadata.

## Success criteria

- 50,000 valid unique wallets queued.
- 50,000 wallet results finalized.
- No pending or processing batches remain.
- Provider failures are zero or explicitly retained for retry/manual review.
- Engine, ruleset, policy, and threshold metadata are persisted.
- PostgreSQL result, enrichment, graph-node, and graph-edge counts reconcile.

## Cleanup

After successful production validation:

- restore the ordinary analysis-worker cron cadence;
- remove the one-time validation bootstrap;
- retain the high-volume provider, scalable engines, worker recovery, benchmarks, and audit trail;
- preserve the completed internal validation analysis as capacity evidence.
