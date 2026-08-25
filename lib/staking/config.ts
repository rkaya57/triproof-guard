const DEFAULT_RPC_URL = "https://api.devnet.solana.com"

export const TRI_DEVNET_MINT =
  process.env.TRI_DEVNET_MINT ?? "7TFLBtSKR4BTwF6LKnzzrpNZfRq5bPN8ig49hKkJKLeW"
export const TRI_DECIMALS = 9
export const TRI_UNITS = 1_000_000_000n
export const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n

function positiveInteger(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export function getStakingPublicConfig() {
  return {
    mint: TRI_DEVNET_MINT,
    rpcUrl: process.env.NEXT_PUBLIC_TRI_DEVNET_RPC_URL ?? DEFAULT_RPC_URL,
    apyBps: positiveInteger("TRI_DEVNET_STAKING_APY_BPS", 1250),
    cooldownDays: positiveInteger("TRI_DEVNET_UNSTAKE_COOLDOWN_DAYS", 7),
    faucetAmountUnits: parseTriAmount(process.env.TRI_DEVNET_FAUCET_AMOUNT ?? "1000"),
  }
}

export function getStakingServerConfig() {
  const publicConfig = getStakingPublicConfig()
  const vaultTokenAccount = process.env.TRI_DEVNET_STAKING_VAULT_TOKEN_ACCOUNT?.trim()
  const vaultSecretKey = process.env.TRI_DEVNET_STAKING_VAULT_SECRET_KEY?.trim()

  if (!vaultTokenAccount || !vaultSecretKey) {
    throw new Error("TRI Devnet staking vault is not configured.")
  }

  return {
    ...publicConfig,
    rpcUrl: process.env.TRI_DEVNET_RPC_URL ?? publicConfig.rpcUrl,
    vaultTokenAccount,
    vaultSecretKey,
  }
}

export function parseTriAmount(value: string) {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{0,9})?$/.test(normalized)) {
    throw new Error("Invalid TRI amount.")
  }
  const [whole, fraction = ""] = normalized.split(".")
  return BigInt(whole) * TRI_UNITS + BigInt((fraction + "000000000").slice(0, TRI_DECIMALS))
}

export function formatTriUnits(value: bigint, maximumFractionDigits = 4) {
  const whole = value / TRI_UNITS
  const fraction = (value % TRI_UNITS).toString().padStart(TRI_DECIMALS, "0")
  const trimmed = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole.toString()
}

export function isPositiveTriUnits(value: string) {
  return /^\d+$/.test(value) && BigInt(value) > 0n
}
