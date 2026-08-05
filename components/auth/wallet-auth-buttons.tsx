"use client"

import { useState } from "react"
import { Loader2, WalletCards } from "lucide-react"

import { Button } from "@/components/ui/button"

declare global {
  interface Window {
    ethereum?: {
      request: (input: { method: string; params?: unknown[] }) => Promise<unknown>
    }
    solana?: {
      isPhantom?: boolean
      connect: () => Promise<{ publicKey: { toString: () => string } }>
      signMessage: (message: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array }>
    }
  }
}

function toBase64(value: Uint8Array) {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

export function WalletAuthButtons({
  purpose,
  redirectTo = "/dashboard",
  remember = false,
  onComplete,
  onError,
}: {
  purpose: "LOGIN" | "LINK"
  redirectTo?: string
  remember?: boolean
  onComplete: (result: { next?: string; linked?: boolean }) => void
  onError?: (message: string) => void
}) {
  const [pending, setPending] = useState<"EVM" | "SOLANA" | null>(null)

  async function requestJson(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const result = (await response.json().catch(() => null)) as
      | { error?: string; token?: string; message?: string; next?: string; linked?: boolean }
      | null
    if (!response.ok) throw new Error(result?.error || "Wallet authentication failed.")
    return result ?? {}
  }

  async function authenticate(chain: "EVM" | "SOLANA") {
    setPending(chain)
    try {
      let address = ""
      let sign: (message: string) => Promise<string>

      if (chain === "EVM") {
        if (!window.ethereum) throw new Error("Install an EVM wallet such as MetaMask first.")
        const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[]
        address = accounts[0] || ""
        if (!address) throw new Error("No EVM wallet account was selected.")
        sign = async (message) => String(await window.ethereum?.request({
          method: "personal_sign",
          params: [message, address],
        }))
      } else {
        if (!window.solana) throw new Error("Install a Solana wallet such as Phantom first.")
        const connected = await window.solana.connect()
        address = connected.publicKey.toString()
        sign = async (message) => {
          const signed = await window.solana!.signMessage(new TextEncoder().encode(message), "utf8")
          return toBase64(signed.signature)
        }
      }

      const challenge = await requestJson("/api/auth/wallet/challenge", {
        chain,
        address,
        purpose,
        redirectTo,
      })
      if (!challenge.token || !challenge.message) throw new Error("Wallet challenge was not created.")
      const signature = await sign(challenge.message)
      const verified = await requestJson("/api/auth/wallet/verify", {
        chain,
        address,
        purpose,
        redirectTo,
        token: challenge.token,
        signature,
        remember,
      })
      onComplete({ next: verified.next, linked: verified.linked })
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Wallet authentication failed.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" disabled={pending !== null} onClick={() => authenticate("EVM")}>
        {pending === "EVM" ? <Loader2 className="animate-spin" /> : <WalletCards />}
        EVM
      </Button>
      <Button type="button" variant="outline" disabled={pending !== null} onClick={() => authenticate("SOLANA")}>
        {pending === "SOLANA" ? <Loader2 className="animate-spin" /> : <WalletCards />}
        Solana
      </Button>
    </div>
  )
}
