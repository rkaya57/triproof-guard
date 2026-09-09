# Tri-Proof HumanGuard V1

HumanGuard is Tri-Proof's adaptive proof-of-human-interaction layer for websites and Web3 applications.

V1 ships four interactive challenge families:

- `QUANTUM_SEAL` — spatial/motor alignment
- `PACKET_INTERCEPT` — dynamic anomaly detection
- `TIME_FRACTURE` — temporal alignment
- `RESONANCE_CORE` — timing/perception

HumanGuard V1 intentionally **does not issue invisible/passive passes yet**. Adaptive mode changes challenge selection and records bootstrap risk signals. Passive bypass should only be enabled after production telemetry has been calibrated and evaluated.

## Security model

HumanGuard uses two credentials with different trust levels:

- `tp_site_...` — public site key. Safe to place in browser code. It can only start/complete HumanGuard sessions for configured origins.
- Tri-Proof API key — secret server credential. Never expose it in browser code. It is required for `/siteverify`.

A browser-side `success = true` flag is never trusted. The server stores the expected challenge result, validates submitted evidence, and only then signs a short-lived proof token. Proofs are one-time-use at `/siteverify`.

Interactive challenges are one signal in a defense-in-depth system; they should not be described as cryptographic proof that automation can never solve them.

## 1. Create a HumanGuard site

Use an authenticated dashboard session or a Tri-Proof API key:

```http
POST /api/v2/humanguard/sites
Authorization: Bearer YOUR_TRIPROOF_API_KEY
Content-Type: application/json
```

```json
{
  "name": "Airdrop Claim",
  "allowedOrigins": ["https://airdrop.example.com"],
  "mode": "ADAPTIVE",
  "walletRequired": true
}
```

The response includes a public site key:

```json
{
  "siteKey": "tp_site_..."
}
```

Origins are exact `scheme + host` matches. Paths, query strings and credentials are not accepted in origin configuration.

## 2. Add the browser widget

```html
<script src="https://triproofprotocol.com/humanguard/v1.js" async></script>

<div
  class="triproof-humanguard"
  data-sitekey="tp_site_YOUR_PUBLIC_SITE_KEY"
  data-action="claim"
  data-wallet="0xUSER_WALLET"
  data-wallet-chain="base">
</div>
```

The SDK mounts the challenge inside Shadow DOM so customer application styles do not leak into the widget.

When verification succeeds, the SDK:

1. Dispatches a `triproof:verified` browser event.
2. Stores the proof token in a hidden field named `triproof-human-response`.

```js
window.addEventListener("triproof:verified", (event) => {
  console.log(event.detail.token)
})
```

The same widget can be mounted programmatically:

```js
await window.TriProofHumanGuard.mount(
  document.querySelector("#human-check"),
  {
    siteKey: "tp_site_YOUR_PUBLIC_SITE_KEY",
    action: "claim",
    wallet: "0xUSER_WALLET",
    walletChain: "base",
    onVerified(result) {
      console.log(result.token)
    }
  }
)
```

## 3. Verify the proof on your backend

Never trust the browser event alone. Send the proof token from your application server to Tri-Proof:

```http
POST /api/v2/humanguard/siteverify
Authorization: Bearer YOUR_SECRET_TRIPROOF_API_KEY
Content-Type: application/json
```

```json
{
  "token": "eyJ...",
  "action": "claim",
  "wallet": "0xUSER_WALLET",
  "walletChain": "base",
  "origin": "https://airdrop.example.com"
}
```

Successful response:

```json
{
  "success": true,
  "object": "humanguard_verification",
  "action": "claim",
  "origin": "https://airdrop.example.com",
  "wallet": "0xUSER_WALLET",
  "walletChain": "base",
  "humanScore": 94,
  "challengeType": "TIME_FRACTURE"
}
```

The proof is consumed atomically. A second `/siteverify` call with the same proof is rejected with `HUMANGUARD_REPLAY_REJECTED`.

## End-to-end flow

```text
Customer browser
    |
    | public tp_site key
    v
POST /api/v2/humanguard/challenge/start
    |
    v
Tri-Proof chooses challenge + stores expected answer
    |
    v
HumanGuard browser widget
    |
    | result + behavioral telemetry
    v
POST /api/v2/humanguard/challenge/complete
    |
    v
Server validates challenge
    |
    v
Short-lived signed HumanGuard proof
    |
    | browser sends token to customer's own backend
    v
Customer backend
    |
    | secret Tri-Proof API key
    v
POST /api/v2/humanguard/siteverify
    |
    v
One-time proof consumed -> action may proceed
```

## Environment

Production requires a dedicated high-entropy secret:

```env
HUMANGUARD_PROOF_SECRET="..."
```

This secret is used for HumanGuard proof signing and rate-limit subject hashing. It must never use a `NEXT_PUBLIC_` prefix or be exposed to browser code.

## Current V1 limits

- Exact origin allowlist only; wildcard origins are intentionally not supported.
- Proof lifetime is five minutes.
- Challenge lifetime is two minutes.
- Public widget endpoints use site-aware network/wallet/session rate limits.
- Server-to-server verification uses existing Tri-Proof API authentication and metering.
- Wallet binding is optional per site; when enabled a challenge cannot start without a wallet.

## Next hardening work

- Add calibrated passive/browser integrity scoring before enabling invisible passes.
- Add wallet/Sybil score as an optional challenge selector signal.
- Add HumanGuard analytics and site configuration UI to the dashboard.
- Add SDK package builds for React/npm in addition to the zero-install browser script.
- Add accessibility fallback challenges and reduced-motion behavior.
