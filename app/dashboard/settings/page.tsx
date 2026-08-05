import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"

import { SettingsClient } from "@/components/dashboard/settings-client"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Page() {
  return (
    <div className="grid gap-5">
      <Card className="glass-panel premium-card border-primary/25">
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="text-primary" />
              Account security
            </CardTitle>
            <CardDescription>
              Review active devices, revoke sessions, link EVM or Solana wallets, and copy your referral URL.
            </CardDescription>
          </div>
          <Link href="/dashboard/settings/security" className={buttonVariants()}>
            Open security controls <ArrowRight data-icon="inline-end" />
          </Link>
        </CardHeader>
      </Card>
      <SettingsClient />
    </div>
  )
}
