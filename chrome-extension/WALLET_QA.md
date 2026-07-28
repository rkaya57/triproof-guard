# ScamGuard Wallet Compatibility Release Gate

Run this checklist before publishing a new extension build. Automated coverage
protects the hook behavior; this guide verifies the actual wallet UI and the
wallet's provider implementation in Chrome.

## Automated gate

```bash
npm run extension:validate
npm run extension:test
npm test
```

All three commands must pass before manual testing begins.

## Test wallet rules

- Use testnet/devnet wallets or empty burner wallets only.
- Never enter a seed phrase, private key, or production wallet password.
- Test against a controlled dApp or a known test page, not an unverified claim site.
- Record the extension version, wallet version, browser version, and the result.

## Solana matrix

| Wallet | Request | Expected ScamGuard behavior | Pass condition |
| --- | --- | --- | --- |
| Phantom | `signTransaction` | Plain-language transaction review opens before the wallet prompt. | Continue reaches Phantom once; cancel never opens the signing flow. |
| Phantom | `signMessage` | Message-signature explanation names it as off-chain authorization. | Wallet receives the exact original message after continue. |
| Backpack | `signAndSendTransaction` | Decoded risk and decision path appear before signing. | Provider return value and dApp success flow remain unchanged. |
| Backpack | `signAllTransactions` | One review covers the batch request. | No duplicate review; each original transaction remains in the batch. |

## EVM matrix

| Wallet | Request | Expected ScamGuard behavior | Pass condition |
| --- | --- | --- |
| MetaMask | `eth_sendTransaction` | Transaction review appears before MetaMask confirmation. | Continue calls MetaMask once with unchanged params. |
| MetaMask | `personal_sign` / typed data | Signature explanation appears before the signature popup. | Continue preserves the original parameter order. |
| Rabby | `eth_sendTransaction` | Provider is found through `ethereum.providers` when present. | One review and one Rabby request only. |
| Any EIP-1193 wallet | `eth_chainId` | No ScamGuard review. | Read call passes through unchanged. |
| Any EIP-1193 wallet | `wallet_switchEthereumChain` / `wallet_addEthereumChain` | Network-change review appears. | Original wallet request receives unchanged params after continue. |
| ERC-5792 compatible wallet | `wallet_sendCalls` | Request is reviewed as a wallet action. | Wallet request stays intact after continue. |

## Failure triage

1. Confirm the extension was reloaded at `chrome://extensions` after the build.
2. Confirm the API base URL is `https://triproofprotocol.com` in ScamGuard settings.
3. Reproduce with one wallet and one request method at a time.
4. Capture the method name, browser console error, wallet version, and extension version.
5. Keep the request blocked if ScamGuard times out or cannot return a decision.

## Release decision

Ship only when the automated gate passes, every relevant wallet row has a
recorded pass, ordinary read calls remain transparent, and blocked decisions
never reach the provider.
