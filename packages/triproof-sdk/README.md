# @triproof/sdk

TypeScript client source for Tri-Proof Campaign API v2, legacy one-off analysis, ScamGuard, and campaign webhook management.

This package is prepared for distribution but is not represented as published until a release is explicitly completed.

## Core methods

Campaign API v2:
- createCampaign
- listCampaigns
- getCampaign
- runCampaignAnalysis
- getCampaignAnalysis
- getCampaignDecisionPackage
- getCampaignDecisionCsv
- changeCampaignLifecycle
- activateCampaignPolicy

Webhook management:
- listWebhooks
- getWebhook
- createWebhook
- updateWebhook
- deleteWebhook

Existing v1 integrations remain supported through createAnalysis and getAnalysis. ScamGuard methods also remain available.

Policy changes created through the SDK apply to future campaign runs and do not recompute historical stored decisions.

Webhook signing secrets are returned only when an endpoint is created. Store them securely and verify incoming requests using the documented Tri-Proof HMAC signature contract.
