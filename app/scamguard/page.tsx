import { ScamGuardPage } from "@/components/scamguard/scamguard-page"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "ScamGuard Solana | Tri-Proof Guard",
  description:
    "Scan suspicious Solana links, wallets, token mints, and transactions before users sign.",
}

export default function Page() {
  return <ScamGuardPage />
}
