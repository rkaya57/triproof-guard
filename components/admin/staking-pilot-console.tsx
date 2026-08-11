"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDownToLine, Clock3, ExternalLink, LoaderCircle, LockKeyhole, Sparkles, Vault, WalletCards } from "lucide-react"

import {
  ensureSplTokenAccountWithWallet,
  getSplTokenAccountForWallet,
  transferSplTokenWithWallet,
} from "@/lib/billing/solana-wallet-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Position = {
  id: string
  walletAddress: string
  tokenAccount: string
  principal: string
  principalUnits: string
  accruedRewards: string
  status: "ACTIVE" | "UNSTAKE_PENDING" | "WITHDRAWN"
  unstakeAvailableAt: string | null
}

type PilotState = {
  config: {
    mint: string
    rpcUrl: string
    vaultTokenAccount: string
    apyBps: number
    cooldownDays: number
    faucetAmount: string
  }
  summary: {
    activePrincipal: string
    accruedRewards: string
    faucetAvailableAt: string | null
  }
  positions: Position[]
}

function toUnits(value: string) {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{0,9})?$/.test(normalized)) throw new Error("Enter a valid TRI amount with up to 9 decimal places.")
  const [whole, fractional = ""] = normalized.split(".")
  const result = BigInt(whole) * 1_000_000_000n + BigInt((fractional + "000000000").slice(0, 9))
  if (result <= 0n) throw new Error("Stake amount must be greater than zero.")
  return result.toString()
}

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-5)}` : value
}

function actionError(payload: unknown) {
  return typeof payload === "object" && payload && "error" in payload
    ? String((payload as { error?: unknown }).error ?? "Request failed.")
    : "Request failed."
}

function relativeReadyAt(value: string | null) {
  if (!value) return "Ready"
  const date = new Date(value)
  if (date <= new Date()) return "Ready to withdraw"
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function StakingPilotConsole() {
  const [state, setState] = useState<PilotState | null>(null)
  const [wallet, setWallet] = useState<{ walletAddress: string; tokenAccount: string } | null>(null)
  const [amount, setAmount] = useState("100")
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch("/api/admin/staking", { cache: "no-store", signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(actionError(payload))
      setState(payload)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        throw new Error("The staking service did not respond within 15 seconds. Please try again.")
      }
      throw reason
    } finally {
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      reload().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load staking pilot."))
    }, 0)
    return () => window.clearTimeout(initialLoad)
  }, [reload])

  const apy = useMemo(() => state ? (state.config.apyBps / 100).toFixed(2) : "12.50", [state])
  const faucetLocked = Boolean(state?.summary.faucetAvailableAt && new Date(state.summary.faucetAvailableAt) > new Date())

  async function callApi(path: string, body: Record<string, unknown>) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(actionError(payload))
    return payload as { signature?: string; amount?: string }
  }

  async function connectWallet() {
    if (!state) return
    setBusy("connect")
    setError(null)
    try {
      const connected = await getSplTokenAccountForWallet({ mintAddress: state.config.mint })
      setWallet(connected)
      setNotice(`Devnet wallet connected: ${shortAddress(connected.walletAddress)}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection failed.")
    } finally {
      setBusy(null)
    }
  }

  async function faucet() {
    if (!state) return
    setBusy("faucet")
    setError(null)
    try {
      const connected = await getSplTokenAccountForWallet({ mintAddress: state.config.mint })
      setWallet(connected)
      const result = await callApi("/api/admin/staking/faucet", connected)
      setNotice(`${result.amount ?? state.config.faucetAmount} TRI sent on Devnet. ${result.signature ? `Tx: ${shortAddress(result.signature)}` : ""}`)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Faucet transfer failed.")
    } finally {
      setBusy(null)
    }
  }

  async function stake() {
    if (!state) return
    setBusy("stake")
    setError(null)
    try {
      const connected = await ensureSplTokenAccountWithWallet({ mintAddress: state.config.mint, rpcUrl: state.config.rpcUrl })
      setWallet(connected)
      const amountUnits = toUnits(amount)
      const transfer = await transferSplTokenWithWallet({
        mintAddress: state.config.mint,
        destinationTokenAccount: state.config.vaultTokenAccount,
        amountUnits,
        rpcUrl: state.config.rpcUrl,
      })
      await callApi("/api/admin/staking", { ...connected, signature: transfer.signature, amountUnits })
      setNotice(`${amount} TRI is now staked on Devnet. Tx: ${shortAddress(transfer.signature)}`)
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Stake transaction failed.")
    } finally {
      setBusy(null)
    }
  }

  async function positionAction(positionId: string, path: string, action: string) {
    setBusy(`${action}:${positionId}`)
    setError(null)
    try {
      const result = await callApi(path, action === "withdraw" ? { positionId, action } : { positionId })
      setNotice(result.signature ? `Devnet transaction confirmed: ${shortAddress(result.signature)}` : "Unstake request recorded. The 7-day waiting period has started.")
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Staking action failed.")
    } finally {
      setBusy(null)
    }
  }

  if (!state) {
    if (error) {
      return (
        <Card className="glass-panel mx-auto max-w-2xl border-rose-400/30">
          <CardHeader>
            <CardTitle className="text-rose-100">Staking pilot could not load</CardTitle>
            <CardDescription className="text-slate-300">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setError(null); reload().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load staking pilot.")) }}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )
    }
    return <div className="flex min-h-72 items-center justify-center text-sm text-slate-400"><LoaderCircle className="mr-2 size-4 animate-spin" /> Loading Devnet pilot</div>
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#071527] p-6 shadow-[0_0_60px_rgba(34,211,238,.08)] sm:p-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(120deg,transparent,rgba(16,185,129,.08))]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-amber-400/25 bg-amber-400/[0.08] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200"><LockKeyhole className="size-3.5" /> Admin-only Devnet pilot</div>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">TRI staking console</h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">Real Devnet TRI transfers, a controlled faucet and a 7-day unstake queue. This pilot uses a managed vault while the public smart-contract release is prepared.</p>
          </div>
          <Button onClick={connectWallet} disabled={busy !== null} className="border border-cyan-300/20 bg-cyan-300 text-slate-950 hover:bg-cyan-200"><WalletCards /> {wallet ? shortAddress(wallet.walletAddress) : "Connect Devnet wallet"}</Button>
        </div>
      </section>

      {(notice || error) && <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-rose-400/30 bg-rose-400/[0.08] text-rose-100" : "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100"}`}>{error ?? notice}</div>}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          [Vault, "Active stake", `${state.summary.activePrincipal} TRI`, "Principal held in Devnet vault", "text-cyan-200"],
          [Sparkles, "Accrued rewards", `${state.summary.accruedRewards} TRI`, `${apy}% fixed pilot APY`, "text-emerald-200"],
          [Clock3, "Unstake delay", `${state.config.cooldownDays} days`, "Principal exits after the queue", "text-amber-200"],
        ].map(([Icon, label, value, detail, color]) => (
          <Card key={label as string} className="glass-panel border-white/10 bg-white/[0.025]">
            <CardContent className="p-5"><Icon className={`size-5 ${color as string}`} /><p className="mt-4 text-xs uppercase tracking-[0.13em] text-slate-500">{label as string}</p><p className={`mt-2 text-2xl font-semibold ${color as string}`}>{value as string}</p><p className="mt-2 text-xs text-slate-400">{detail as string}</p></CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="glass-panel border-cyan-400/20">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Vault className="size-5 text-cyan-200" /> Stake TRI</CardTitle><CardDescription className="text-slate-400">Approve a transfer from your Devnet wallet into the dedicated staking vault.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2"><label htmlFor="stake-amount" className="text-xs font-medium text-slate-300">Amount</label><div className="flex rounded-md border border-white/10 bg-slate-950/50 focus-within:border-cyan-300/50"><input id="stake-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-white outline-none" /><span className="px-3 py-3 font-mono text-xs text-cyan-200">TRI</span></div></div>
            <div className="flex flex-wrap gap-2">{["100", "500", "1000"].map((value) => <Button key={value} type="button" size="sm" variant="outline" onClick={() => setAmount(value)} disabled={busy !== null}>{value} TRI</Button>)}</div>
            <Button onClick={stake} disabled={busy !== null} className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">{busy === "stake" ? <LoaderCircle className="animate-spin" /> : <Vault />} Stake on Devnet</Button>
            <p className="text-xs leading-5 text-slate-500">Your wallet needs a small Devnet SOL balance to pay transaction fees and create its TRI token account.</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-emerald-400/20">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><ArrowDownToLine className="size-5 text-emerald-200" /> Test faucet</CardTitle><CardDescription className="text-slate-400">Receive actual Devnet TRI before placing a test stake.</CardDescription></CardHeader>
          <CardContent className="space-y-4"><div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-4"><p className="font-mono text-xs uppercase tracking-[0.13em] text-emerald-200">Faucet allocation</p><p className="mt-2 text-3xl font-semibold text-white">{state.config.faucetAmount} TRI</p><p className="mt-2 text-xs text-slate-400">One completed claim per admin account every 24 hours.</p></div><Button onClick={faucet} disabled={busy !== null || faucetLocked} className="w-full bg-emerald-300 text-emerald-950 hover:bg-emerald-200">{busy === "faucet" ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />}{faucetLocked ? "Faucet cooldown active" : "Claim Devnet TRI"}</Button>{faucetLocked && <p className="text-center text-xs text-amber-200">Available {relativeReadyAt(state.summary.faucetAvailableAt)}</p>}</CardContent>
        </Card>
      </section>

      <Card className="glass-panel border-white/10">
        <CardHeader><CardTitle className="text-white">Your staking positions</CardTitle><CardDescription className="text-slate-400">Rewards accrue while a position is active. Requesting unstake freezes rewards and starts the 7-day timer.</CardDescription></CardHeader>
        <CardContent className="space-y-3">{state.positions.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">No Devnet TRI positions yet.</div> : state.positions.map((position) => <div key={position.id} className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/25 p-4 lg:grid-cols-[1.1fr_.8fr_.8fr_auto] lg:items-center"><div><p className="text-lg font-semibold text-white">{position.principal} TRI</p><p className="mt-1 font-mono text-[10px] text-slate-500">{shortAddress(position.walletAddress)}</p></div><div><p className="text-xs uppercase tracking-[0.12em] text-slate-500">Claimable</p><p className="mt-1 font-medium text-emerald-200">{position.accruedRewards} TRI</p></div><div><p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p><p className="mt-1 text-sm text-cyan-100">{position.status === "ACTIVE" ? "Earning" : position.status === "UNSTAKE_PENDING" ? relativeReadyAt(position.unstakeAvailableAt) : "Withdrawn"}</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><Button size="sm" variant="outline" onClick={() => positionAction(position.id, "/api/admin/staking/claim", "claim")} disabled={busy !== null || position.status === "WITHDRAWN"}>Claim</Button>{position.status === "ACTIVE" && <Button size="sm" variant="outline" onClick={() => positionAction(position.id, "/api/admin/staking/unstake", "request")} disabled={busy !== null}>Unstake</Button>}{position.status === "UNSTAKE_PENDING" && position.unstakeAvailableAt && new Date(position.unstakeAvailableAt) <= new Date() && <Button size="sm" onClick={() => positionAction(position.id, "/api/admin/staking/unstake", "withdraw")} disabled={busy !== null}>Withdraw</Button>}</div></div>)}</CardContent>
      </Card>

      <a href={`https://explorer.solana.com/address/${state.config.mint}?cluster=devnet`} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-xs text-cyan-200 hover:text-cyan-100">TRI Devnet mint {shortAddress(state.config.mint)} <ExternalLink className="size-3.5" /></a>
    </div>
  )
}
