# ScamGuard Web3 Shield Chrome Extension

Pre-sign protection for Solana and EVM dApps, airdrops, token claims, and suspicious wallet actions.

## Protection features

- Popup current-tab URL scanner.
- Page banner with live URL risk status.
- Page link scanner for visible links.
- Injected Solana provider pre-sign observer for:
  - `signTransaction`
  - `signAndSendTransaction`
  - `signAllTransactions`
  - `signMessage`
  - generic signing `provider.request(...)` calls
- Plain-language signing review for every intercepted wallet request, including approvals, transfers, authority changes, account closure, mint actions, and message signatures.
- EIP-712 typed-data review that highlights permit, order, authorization, and transfer-capable message signatures with their primary type and verifying contract when present.
- EVM `eth_call` preflight for transaction-shaped requests when an EVM RPC is configured, plus existing Solana transaction simulation evidence when a serializable transaction is available.
- Local transaction firewall rules for unlimited approvals, approvals to EOAs, Solana authority changes, critical pages, and unverified signing domains.
- Browser-observed page signals for recovery-phrase/private-key forms, wallet deep links, hidden cross-origin frames, and clipboard-write behavior. These signals are bounded and used only in the current scan decision.
- A short decision timeline that shows source context, decoded intent, evidence, and the final risk decision.
- Local scan history for the latest 100 site and wallet checks. History stores a redacted target and decision summary only.
- A local Security Center that summarizes risk events, blocked critical events, protected domains, and active firewall rules.
- Shareable, privacy-preserving report snapshots that omit raw wallet payloads, public keys, and URL query parameters.
- One-click handoff to the moderated Tri-Proof Threat Pool, where users can submit the current site for admin review.
- Injected EVM provider pre-sign observer for MetaMask/Rabby/Coinbase style:
  - `eth_sendTransaction`
  - `eth_signTransaction`
  - `personal_sign`
  - `eth_sign`
  - `eth_signTypedData_v4`
  - `wallet_switchEthereumChain`
  - `wallet_addEthereumChain`
  - `wallet_sendCalls`
- Local settings:
  - API base URL
  - warn on caution-level signing
  - block critical pages with overlay
  - block unlimited approvals and approvals to EOAs
  - optionally block Solana authority changes
  - require a review for unverified signing domains
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
- Local history and shared reports never include raw transaction payloads, seed phrases, private keys, or query parameters.

## Validation

From the repo root:

```bash
npm run extension:validate
```

## Wallet compatibility lab

The repository includes an automated provider compatibility matrix. It runs the
real injected hook against mocked Phantom/Backpack-style and MetaMask/Rabby-style
providers, verifies safe read calls pass through unchanged, and checks that a
blocked review never reaches the wallet provider.

```bash
npm run extension:test
```

For browser wallet release testing, use [WALLET_QA.md](./WALLET_QA.md).
