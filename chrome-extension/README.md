# ScamGuard for Solana Chrome Extension

Pre-sign protection for Solana dApps, airdrops, token claims, and suspicious wallet actions.

## MVP features

- Popup current-tab URL scanner.
- Page banner with live URL risk status.
- Page link scanner for visible links.
- Injected Solana provider pre-sign observer for:
  - `signTransaction`
  - `signAndSendTransaction`
  - `signAllTransactions`
  - generic signing `provider.request(...)` calls
- Warning overlay for caution, high-risk, and critical signing flows.
- Local settings:
  - API base URL
  - warn on caution-level signing
  - block critical pages with overlay
  - trusted domains

## Local install

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder:

```text
chrome-extension
```

## Default API

The extension uses:

```text
https://triproofprotocol.com
```

Public scanner endpoint used by the popup and content script:

```text
POST /api/scamguard/scan-url
POST /api/scamguard/scan-transaction
```

## Privacy boundary

- The extension never asks for seed phrases, private keys, or mnemonics.
- It only reads page URLs, page links, and transaction payloads that the dApp asks the wallet provider to sign.
- It does not read wallet extension internal pages.
- Transaction payloads are sent to the configured ScamGuard API for risk analysis.
- The connected wallet public key may be sent as context when available.

## Validation

From the repo root:

```bash
npm run extension:validate
```
