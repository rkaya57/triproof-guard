import assert from "node:assert/strict"
import { generateKeyPairSync, sign as signEd25519 } from "node:crypto"
import test from "node:test"

import { Wallet } from "ethers"

import {
  normalizeAuthWalletAddress,
  verifyAuthWalletMessageSignature,
} from "./wallet"

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function encodeBase58(value: Uint8Array) {
  const digits = [0]
  for (const byte of value) {
    let carry = byte
    for (let index = 0; index < digits.length; index += 1) {
      const current = digits[index] * 256 + carry
      digits[index] = current % 58
      carry = Math.floor(current / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let output = ""
  for (let index = 0; index < value.length - 1 && value[index] === 0; index += 1) {
    output += "1"
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += base58Alphabet[digits[index]]
  }
  return output
}

test("EVM wallet addresses are validated and normalized", () => {
  assert.equal(
    normalizeAuthWalletAddress("EVM", "0x000000000000000000000000000000000000dEaD"),
    "0x000000000000000000000000000000000000dead"
  )
  assert.throws(() => normalizeAuthWalletAddress("EVM", "0x1234"))
})

test("Solana wallet addresses are validated without case normalization", () => {
  const address = "11111111111111111111111111111111"
  assert.equal(normalizeAuthWalletAddress("SOLANA", address), address)
  assert.throws(() => normalizeAuthWalletAddress("SOLANA", "not-a-solana-address"))
})

test("EVM authentication verifies the exact signed message", async () => {
  const wallet = Wallet.createRandom()
  const message = "Tri-Proof EVM authentication test"
  const signature = await wallet.signMessage(message)

  assert.equal(
    verifyAuthWalletMessageSignature({
      chain: "EVM",
      address: wallet.address,
      message,
      signature,
    }),
    true
  )
  assert.equal(
    verifyAuthWalletMessageSignature({
      chain: "EVM",
      address: wallet.address,
      message: `${message} modified`,
      signature,
    }),
    false
  )
})

test("Solana authentication verifies an Ed25519 message signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" })
  const rawPublicKey = publicKeyDer.subarray(publicKeyDer.length - 32)
  const address = encodeBase58(rawPublicKey)
  const message = "Tri-Proof Solana authentication test"
  const signature = signEd25519(null, Buffer.from(message, "utf8"), privateKey).toString("base64")

  assert.equal(
    verifyAuthWalletMessageSignature({
      chain: "SOLANA",
      address,
      message,
      signature,
    }),
    true
  )
  assert.equal(
    verifyAuthWalletMessageSignature({
      chain: "SOLANA",
      address,
      message: `${message} modified`,
      signature,
    }),
    false
  )
})
