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
- EIP-712 typed-data review that translates Permit, asset-order, delegation, and authorization payloads into spender, amount, expiry, primary type, domain, and verifying-contract context when present.
- EIP-5792 Wallet Call API support: `wallet_sendCalls` batches are retained end-to-end, decomposed into a per-call risk ledger, and shown before the wallet request continues.
- EVM `eth_call` preflight for every decodable batch call or transaction-shaped request when an EVM RPC is configured, plus existing Solana transaction simulation evidence when a serializable transaction is available.
- Local transaction firewall rules for unlimited approvals, approvals to EOAs, Solana authority changes, critical pages, and unverified signing domains.
- Browser-observed page signals for recovery-phrase/private-key forms, wallet deep links, hidden cross-origin frames, and clipboard-write behavior. These signals are bounded and used only in the current scan decision.
- A short decision timeline that shows source context, decoded intent, evidence, and the final risk decision.
- Local scan history for the latest 100 site and wallet checks. History stores a redacted target and decision summary only.
- A local Security Center that summarizes risk events, blocked critical events, protected domains, and active firewall rules.
- A persistent Chrome Security Center side panel for the selected site, decision path, local evidence, and private browser history. If Chrome cannot open a side panel, ScamGuard opens the same Security Center in a full extension tab.
- Expected wallet-impact cards for decoded EVM calldata: outgoing native/token calls, approval recipients, raw-unit amounts, and explicit "decoded payload" versus "preflight only" confidence.
- A private **Observed Permissions** ledger in the Security Center. It records approval requests seen by this browser, clearly labels them as observed requests, and never claims they were signed or remain active on-chain.
- A user-triggered **Verify live permissions** check in the Security Center. On EVM it rechecks compatible ERC-20 approval requests previously observed by ScamGuard with read-only `eth_call` allowance reads. On Solana it reads active SPL Token and Token-2022 delegates for the connected wallet. It never requests a signature, sends a transaction, or claims to be a complete portfolio-permission crawl.
- A **Navigation & Brand Shield** for ordinary, same-tab external link clicks. It uses the live ScamGuard URL decision before navigation, shows a review screen for elevated risk, and prevents critical destinations from opening. The decision includes reviewed threat intelligence plus redirect, punycode/homograph, brand-impersonation, and typosquatting signals when present.
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
  - optional Team Policy Sync: paste a Tri-Proof B2B API key to apply the same active organization rules used by the API and Telegram Guardian. The key is stored only in `chrome.storage.local`, never synced with Chrome or included in shared reports. Policies refresh at most once every 10 minutes; a cached policy is used if the network is unavailable. Matched `BLOCK` and `REVIEW` rules are written to the Policy Activity Center and can trigger signed webhooks.

## Account and plan access

- Connect a Tri-Proof account from the popup using the displayed six-character pairing code.
- The connection grants the browser only a revocable, scoped extension token. It never exposes an account password or wallet secret to the extension.
- Free accounts receive the server-backed daily scan allowance. Builder and higher plans unlock Deep URL Sandbox and Scam DNA analysis, plus their higher daily limits.
- Disconnect Browser revokes the device token server-side and removes it from local extension storage.
- The official production API is fixed to `https://triproofprotocol.com`; `localhost` is allowed only for local development. This prevents accidental routing of wallet request data to an arbitrary endpoint.

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
- The Observed Permissions ledger stays in browser-local extension storage. It contains public token-contract and spender addresses from intercepted approval requests; it is not sent to ScamGuard as an inventory.
- Live permission checks are initiated only when the user presses **Check connected wallet**. Results are rendered in the open Security Center and are not persisted as a wallet inventory by the extension.
- Navigation checks use the configured ScamGuard API and respect the user's product scan access and rate limits. Modified clicks, downloads, new-tab links, and browser-initiated or script-initiated navigations are not intercepted by this browser-side guard; the destination is still scanned after load when the extension can run there.

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
