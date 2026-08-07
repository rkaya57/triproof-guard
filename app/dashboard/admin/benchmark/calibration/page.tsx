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

export default async function InternalCalibrationPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  return (
    <div className="flex flex-col gap-6">
      <CalibrationUpload />
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
