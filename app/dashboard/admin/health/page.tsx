import Link from "next/link"

import { getAdminHealthChecks } from "@/lib/admin/health"
import { getAdminUser } from "@/lib/auth/admin"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) {
    return (
      <Card className="glass-panel mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Admin login required</CardTitle>
          <CardDescription>Log in with a Tri-Proof admin email.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonVariants()}>Login</Link>
        </CardContent>
      </Card>
    )
  }

  const checks = await getAdminHealthChecks()

  return (
    <div className="flex flex-col gap-6">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Database, API keys, treasury wallets and worker configuration.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {checks.map((check) => (
            <div key={check.name} className="rounded-lg border border-border bg-background/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{check.name}</p>
                <span className={check.ok ? "text-green-300" : "text-red-300"}>{check.ok ? "Healthy" : "Needs action"}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{check.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
