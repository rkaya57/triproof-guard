# Vercel rebuild marker

The nullable `analysis.enrichmentWarnings` build failure is fixed by routing persisted warning values through the `lastWarning(value: unknown)` helper before reading the final message.

This commit exists to trigger a fresh Vercel build from the latest `fix/sybil-engine-safety` branch state rather than the obsolete `b793e4c` deployment commit.
