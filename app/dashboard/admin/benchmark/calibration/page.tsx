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

import { CalibrationAdjudicationUpload } from "../calibration-adjudication-upload"
import { CalibrationUpload } from "../calibration-upload"

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">
          Internal benchmark calibration is restricted to approved Tri-Proof admins.
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

function AdjudicationMethodologyGuard() {
  return (
    <Card className="glass-panel border-amber-400/30 bg-amber-400/[0.03]">
      <CardHeader>
        <CardTitle className="text-amber-100">Methodology guard — external independence is not satisfied</CardTitle>
        <CardDescription className="max-w-4xl leading-6 text-slate-300">
          The adjudication workflow may report whether reviewer names are separated between the first and second pass. That is an administrative provenance check only. It is not evidence of an independent human reviewer, reviewer blindness, or independent holdout validation. All adjudication results on this page remain internal and claim-ineligible.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm leading-6 text-amber-100/80">
        Any legacy “independence” indicator inside the adjudication card must be interpreted only as reviewer-name separation. Public performance claims require the separate Independent Holdout Validation workflow after the stack is frozen.
      </CardContent>
    </Card>
  )
}

export default async function InternalCalibrationPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  return (
    <div className="flex flex-col gap-6">
      <CalibrationUpload />
      <AdjudicationMethodologyGuard />
      <CalibrationAdjudicationUpload />
      <div>
        <Link
          href="/dashboard/admin/benchmark"
          className={`${buttonVariants({ variant: "outline" })} text-white`}
        >
          Back to Blind Review Queue
        </Link>
      </div>
    </div>
  )
}
