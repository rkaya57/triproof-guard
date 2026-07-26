import { ScamGuardPage } from "@/components/scamguard/scamguard-page"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "ScamGuard Multichain | Tri-Proof Guard",
  description:
    "Scan suspicious Web3 links, wallets, token contracts, and transactions before users sign.",
}

export default function Page() {
  return <ScamGuardPage />
}
