# Chrome Web Store Release Checklist

## Store listing

- Name: `ScamGuard Web3 Shield`
- Category: Privacy and security
- Single purpose: Explain and warn about risky Web3 destinations and wallet requests before a user signs.
- Support and privacy URLs: `https://triproofprotocol.com/contact` and `https://triproofprotocol.com/privacy`
- Never claim that every threat is detected or that a score guarantees safety.

## Permission disclosures

- `http://*/*` and `https://*/*`: ScamGuard must inspect the site a user visits, flag risky links, and show pre-sign warnings across Web3 sites. It does not run on Chrome internal pages.
- `storage`: Stores user settings, browser-local decision history, account pairing state, and optional Team Policy configuration.
- `activeTab`: Reads the currently selected tab when the popup or Security Center is opened.
- `notifications`: Optional high-risk notifications; users can disable them in Advanced controls.
- `sidePanel`: Opens the local Security Center beside the current page.

## Data disclosures

- The extension sends URLs, selected public wallet context, and transaction payloads presented to the wallet to the Tri-Proof ScamGuard API for analysis.
- It never asks for or sends seed phrases, private keys, wallet passwords, recovery phrases, or wallet-extension internal data.
- Account pairing uses a user-confirmed short code. The browser receives a revocable scoped access token, not the user password.
- Scan history and the observed-permissions ledger remain in local extension storage. Shared reports redact query parameters and raw wallet payloads.

## Release gate

1. Run `npm run extension:validate`.
2. Run `npm run extension:test`.
3. Run `npm test` and `npm run build`.
4. Follow `WALLET_QA.md` with a testnet or empty burner wallet.
5. Verify the privacy-policy and support URLs are live before submission.
