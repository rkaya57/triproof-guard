import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

import { HoldoutWorkspace } from "./holdout-workspace"

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">
          Independent Holdout Validation controls are restricted to approved Tri-Proof admins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </CardContent>
    </Card>
  )
}

export default async function IndependentHoldoutPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  return (
    <div className="flex flex-col gap-6">
      <HoldoutWorkspace />
      <div>
        <Link
          href="/dashboard/admin/benchmark"
          className={`${buttonVariants({ variant: "outline" })} text-white`}
        >
          Back to benchmark admin
        </Link>
      </div>
    </div>
  )
}
