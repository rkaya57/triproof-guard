import Link from "next/link"

import { TelegramGuardianConsole } from "@/components/admin/telegram-guardian-console"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

function AccessDenied() {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Admin login required</CardTitle>
        <CardDescription>Telegram Guardian operations are only visible to approved Tri-Proof admins.</CardDescription>
        <Link href="/login" className={buttonVariants()}>Login</Link>
      </CardHeader>
    </Card>
  )
}

export default async function TelegramGuardianAdminPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  return (
    <div className="grid gap-7">
      <section>
        <p className="text-xs uppercase tracking-[0.22em] text-primary">Community protection operations</p>
        <h1 className="text-gradient mt-3 text-3xl font-semibold sm:text-5xl">Telegram Group Guardian</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Monitor protected communities, approve groups, control alert thresholds, and review repeated threat campaigns from one console.
        </p>
      </section>
      <TelegramGuardianConsole />
    </div>
  )
}
