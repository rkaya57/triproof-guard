"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDownToLine,
  BadgeCheck,
  ChartNoAxesCombined,
  Clock3,
  Coins,
  ExternalLink,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Vault,
  WalletCards,
} from "lucide-react"

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
  const activePositions = state?.positions.filter((position) => position.status === "ACTIVE").length ?? 0

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
    <div className="flex flex-col gap-5 pb-10">
      <section className="relative isolate overflow-hidden rounded-lg border border-cyan-400/30 bg-[#071629] px-5 py-6 shadow-[0_0_55px_rgba(34,211,238,.10)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] [background-size:26px_26px]" />
        <div className="relative grid gap-7 xl:grid-cols-[1fr_300px] xl:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded border border-amber-300/30 bg-amber-300/[.08] px-2 py-1 font-mono text-[10px] uppercase tracking-[.16em] text-amber-100"><LockKeyhole className="size-3" /> Admin-only Devnet pilot</span>
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-300/25 bg-emerald-300/[.08] px-2 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-emerald-200"><span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.9)]" /> Vault online</span>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2"><h2 className="text-3xl font-semibold text-white sm:text-4xl">TRI Yield Vault</h2><span className="mb-1 font-mono text-xs uppercase tracking-[.18em] text-cyan-200">Devnet season 01</span></div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Stake real Devnet TRI, track reward accrual and control the seven-day exit queue from one protected vault console.</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300"><span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-4 text-emerald-300" /> Real Devnet transfers</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-cyan-300" /> Managed vault custody</span><span className="inline-flex items-center gap-1.5"><Clock3 className="size-4 text-amber-300" /> {state.config.cooldownDays}-day exit queue</span></div>
          </div>
          <div className="grid gap-3 rounded-lg border border-cyan-300/20 bg-slate-950/35 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.16em] text-slate-400">Wallet access</span><span className={`inline-flex items-center gap-1.5 text-xs ${wallet ? "text-emerald-200" : "text-amber-200"}`}><span className={`size-1.5 rounded-full ${wallet ? "bg-emerald-300" : "bg-amber-300"}`} /> {wallet ? "Connected" : "Not connected"}</span></div>
            <p className="truncate font-mono text-sm text-white">{wallet ? wallet.walletAddress : "Connect a Devnet wallet"}</p>
            <Button onClick={connectWallet} disabled={busy !== null} className="w-full border border-cyan-200/20 bg-cyan-300 text-slate-950 hover:bg-cyan-200"><WalletCards /> {wallet ? "Manage connected wallet" : "Connect Devnet wallet"}</Button>
          </div>
        </div>
      </section>

      {(notice || error) && <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${error ? "border-rose-400/30 bg-rose-400/[0.08] text-rose-100" : "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100"}`}>{error ? <Gauge className="size-4 shrink-0" /> : <BadgeCheck className="size-4 shrink-0" />}{error ?? notice}</div>}

      <section className="grid gap-3 md:grid-cols-3">
        {[
          [Vault, "Vault balance", `${state.summary.activePrincipal} TRI`, "Principal protected in Devnet vault", "border-cyan-400/25", "bg-cyan-300/10", "text-cyan-200"],
          [Sparkles, "Rewards in motion", `${state.summary.accruedRewards} TRI`, `${apy}% fixed pilot APY`, "border-emerald-400/25", "bg-emerald-300/10", "text-emerald-200"],
          [Clock3, "Exit window", `${state.config.cooldownDays} days`, "Unstake cooldown before withdrawal", "border-amber-400/25", "bg-amber-300/10", "text-amber-200"],
        ].map(([Icon, label, value, detail, border, iconBackground, color]) => (
          <Card key={label as string} className={`glass-panel relative overflow-hidden ${border as string} bg-slate-950/25`}>
            <div className={`absolute inset-x-0 top-0 h-px ${iconBackground as string}`} />
            <CardContent className="relative p-5"><div className="flex items-start justify-between"><div className={`flex size-9 items-center justify-center rounded-md ${iconBackground as string}`}><Icon className={`size-5 ${color as string}`} /></div><span className="font-mono text-[10px] uppercase tracking-[.14em] text-slate-500">Live metric</span></div><p className="mt-5 text-xs uppercase tracking-[.13em] text-slate-500">{label as string}</p><p className={`mt-1 text-3xl font-semibold ${color as string}`}>{value as string}</p><p className="mt-2 text-xs text-slate-400">{detail as string}</p></CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="glass-panel overflow-hidden border-cyan-400/30 bg-[#09182a]">
          <CardHeader className="border-b border-white/10 bg-cyan-300/[.035] pb-5"><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-white"><Coins className="size-5 text-cyan-200" /> Fund your position</CardTitle><CardDescription className="mt-1 text-slate-400">Deposit TRI from your Devnet wallet into the vault.</CardDescription></div><span className="rounded border border-cyan-300/25 bg-cyan-300/[.08] px-2 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-cyan-100">{apy}% APY</span></div></CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-2"><div className="flex items-center justify-between"><label htmlFor="stake-amount" className="text-xs font-medium text-slate-300">Stake amount</label><span className="font-mono text-[10px] uppercase tracking-[.12em] text-slate-500">TRI Devnet</span></div><div className="flex items-center rounded-md border border-cyan-300/20 bg-slate-950/70 px-3 focus-within:border-cyan-300/60 focus-within:ring-1 focus-within:ring-cyan-300/20"><Coins className="mr-2 size-5 text-cyan-200" /><input id="stake-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0 flex-1 bg-transparent py-4 text-2xl font-semibold text-white outline-none" /><span className="rounded border border-cyan-300/20 bg-cyan-300/[.07] px-2 py-1 font-mono text-xs text-cyan-100">TRI</span></div></div>
            <div className="flex flex-wrap gap-2">{["100", "500", "1000"].map((value) => <Button key={value} type="button" size="sm" variant="outline" onClick={() => setAmount(value)} disabled={busy !== null} className={amount === value ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" : "border-white/15 bg-white/[.025]"}>{value} TRI</Button>)}</div>
            <div className="grid grid-cols-2 divide-x divide-white/10 border-y border-white/10 py-3 text-xs"><div className="pr-3"><p className="font-mono uppercase tracking-[.12em] text-slate-500">Reward rate</p><p className="mt-1 font-medium text-emerald-200">{apy}% fixed APY</p></div><div className="pl-3"><p className="font-mono uppercase tracking-[.12em] text-slate-500">Withdrawal</p><p className="mt-1 font-medium text-amber-200">{state.config.cooldownDays}-day queue</p></div></div>
            <Button onClick={stake} disabled={busy !== null} className="h-11 w-full bg-cyan-300 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,.20)] hover:bg-cyan-200">{busy === "stake" ? <LoaderCircle className="animate-spin" /> : <Vault />} Stake {amount || "TRI"} on Devnet</Button>
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-cyan-300" /> Your wallet needs a small Devnet SOL balance for transaction fees.</p>
          </CardContent>
        </Card>

        <Card className="glass-panel overflow-hidden border-emerald-400/30 bg-[#081b24]">
          <CardHeader className="border-b border-emerald-300/15 bg-emerald-300/[.035] pb-5"><div className="flex items-start justify-between"><div><CardTitle className="flex items-center gap-2 text-white"><ArrowDownToLine className="size-5 text-emerald-200" /> Test faucet</CardTitle><CardDescription className="mt-1 text-slate-400">One controlled TRI allocation for this pilot.</CardDescription></div><Sparkles className="size-5 text-emerald-200" /></div></CardHeader>
          <CardContent className="space-y-4 p-5"><div className="relative overflow-hidden rounded-md border border-emerald-300/25 bg-emerald-300/[.07] p-5"><div className="absolute right-3 top-3 font-mono text-[10px] uppercase tracking-[.15em] text-emerald-200/70">Allocation</div><p className="font-mono text-xs uppercase tracking-[.14em] text-emerald-200">Available to stake</p><p className="mt-2 text-4xl font-semibold text-white">{state.config.faucetAmount} <span className="text-xl text-emerald-200">TRI</span></p><p className="mt-3 max-w-xs text-xs leading-5 text-slate-400">A completed claim is locked for 24 hours per admin account.</p></div><div className="flex items-center gap-3 border-y border-emerald-300/10 py-3 text-xs text-slate-400"><div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-emerald-300/30 text-emerald-200">1</div><span>Claim, then move TRI into an active vault position.</span></div><Button onClick={faucet} disabled={busy !== null || faucetLocked} className="h-11 w-full bg-emerald-300 text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,.16)] hover:bg-emerald-200">{busy === "faucet" ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />}{faucetLocked ? "Faucet cooldown active" : "Claim Devnet TRI"}</Button>{faucetLocked && <p className="text-center font-mono text-[11px] text-amber-200">Available {relativeReadyAt(state.summary.faucetAvailableAt)}</p>}</CardContent>
        </Card>
      </section>

      <Card className="glass-panel overflow-hidden border-white/10 bg-[#081525]">
        <CardHeader className="flex-row items-start justify-between gap-4 border-b border-white/10 pb-5"><div><CardTitle className="flex items-center gap-2 text-white"><ChartNoAxesCombined className="size-5 text-cyan-200" /> Your vault positions</CardTitle><CardDescription className="mt-1 text-slate-400">Rewards accrue while active. Requesting unstake freezes rewards and opens the exit timer.</CardDescription></div><div className="shrink-0 rounded border border-cyan-300/20 bg-cyan-300/[.06] px-2.5 py-1.5 text-right"><p className="font-mono text-[10px] uppercase tracking-[.12em] text-slate-500">Active positions</p><p className="mt-0.5 text-sm font-semibold text-cyan-100">{activePositions}</p></div></CardHeader>
        <CardContent className="space-y-2 p-3 sm:p-4">{state.positions.length === 0 ? <div className="rounded-md border border-dashed border-white/10 py-12 text-center text-sm text-slate-500">No Devnet TRI positions yet.</div> : state.positions.map((position) => <div key={position.id} className="group grid gap-4 rounded-md border border-white/10 bg-slate-950/35 p-4 transition-colors hover:border-cyan-300/30 hover:bg-cyan-300/[.025] lg:grid-cols-[1.2fr_.75fr_.75fr_auto] lg:items-center"><div className="flex items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/[.07]"><Vault className="size-5 text-cyan-200" /></div><div><p className="text-lg font-semibold text-white">{position.principal} <span className="text-sm text-cyan-200">TRI</span></p><p className="mt-0.5 font-mono text-[10px] text-slate-500">{shortAddress(position.walletAddress)}</p></div></div><div><p className="font-mono text-[10px] uppercase tracking-[.12em] text-slate-500">Claimable now</p><p className="mt-1 font-semibold text-emerald-200">{position.accruedRewards} TRI</p></div><div><p className="font-mono text-[10px] uppercase tracking-[.12em] text-slate-500">Position status</p><p className={`mt-1 inline-flex items-center gap-1.5 text-sm ${position.status === "ACTIVE" ? "text-emerald-200" : position.status === "UNSTAKE_PENDING" ? "text-amber-200" : "text-slate-400"}`}><span className={`size-1.5 rounded-full ${position.status === "ACTIVE" ? "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.8)]" : position.status === "UNSTAKE_PENDING" ? "bg-amber-300" : "bg-slate-500"}`} />{position.status === "ACTIVE" ? "Earning" : position.status === "UNSTAKE_PENDING" ? relativeReadyAt(position.unstakeAvailableAt) : "Withdrawn"}</p></div><div className="flex flex-wrap gap-2 lg:justify-end"><Button size="sm" variant="outline" onClick={() => positionAction(position.id, "/api/admin/staking/claim", "claim")} disabled={busy !== null || position.status === "WITHDRAWN"} className="border-emerald-300/25 bg-emerald-300/[.06] text-emerald-100 hover:bg-emerald-300/15">Claim</Button>{position.status === "ACTIVE" && <Button size="sm" variant="outline" onClick={() => positionAction(position.id, "/api/admin/staking/unstake", "request")} disabled={busy !== null} className="border-amber-300/25 bg-amber-300/[.05] text-amber-100 hover:bg-amber-300/15">Unstake</Button>}{position.status === "UNSTAKE_PENDING" && position.unstakeAvailableAt && new Date(position.unstakeAvailableAt) <= new Date() && <Button size="sm" onClick={() => positionAction(position.id, "/api/admin/staking/unstake", "withdraw")} disabled={busy !== null}>Withdraw</Button>}</div></div>)}</CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-2 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-300" /> Devnet vault operations online</span><a href={`https://explorer.solana.com/address/${state.config.mint}?cluster=devnet`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-cyan-200 hover:text-cyan-100">TRI Devnet mint {shortAddress(state.config.mint)} <ExternalLink className="size-3.5" /></a></div>
    </div>
  )
}
