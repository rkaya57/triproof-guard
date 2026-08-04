import { ExtensionConnectCard } from "@/components/extension/extension-connect-card"
import { requirePageUser } from "@/lib/auth/page"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Connect ScamGuard Extension | Tri-Proof Guard",
  description: "Securely connect the ScamGuard browser extension to your Tri-Proof Guard account.",
}

export default async function Page({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const params = await searchParams
  const requestId = typeof params.request === "string" ? params.request : ""
  const user = await requirePageUser(`/extension/connect?request=${encodeURIComponent(requestId)}`)
  return <ExtensionConnectCard requestId={requestId} userName={user.name} />
}
