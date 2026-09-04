import { redirect } from "next/navigation"

export default function DiagnosticsRedirectPage() {
  redirect("/dashboard/admin/diagnostics")
}
