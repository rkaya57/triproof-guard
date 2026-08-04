import Link from "next/link"

import { AirdropReviewConsoleV2 } from "@/components/admin/airdrop-review-console-v2"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">Airdrop task review is only visible to approved Tri-Proof admin emails.</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>
      </CardContent>
    </Card>
  )
}

export default async function AirdropAdminPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  return <AirdropReviewConsoleV2 />
}
