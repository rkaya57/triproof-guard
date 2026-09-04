import Link from "next/link"
import { FilePenLine } from "lucide-react"

import { AdminWorkspaceHeader } from "@/components/admin/admin-workspace-header"
import { BlogDraftConsole } from "@/components/admin/blog-draft-console"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) {
    return <Card className="glass-panel"><CardHeader><CardTitle>Admin login required</CardTitle></CardHeader><CardContent><Link href="/login" className={buttonVariants()}>Login</Link></CardContent></Card>
  }

  return (
    <div className="grid gap-6">
      <AdminWorkspaceHeader
        icon={FilePenLine}
        eyebrow="Content operations"
        title="Blog publishing workspace"
        description="Create, review and publish Tri-Proof research notes from an admin-restricted workspace while the public Blog remains read-only."
        tone="violet"
        actions={<Link href="/blog" className={buttonVariants({ variant: "outline", size: "sm" })}>Open public blog</Link>}
      />
      <BlogDraftConsole />
    </div>
  )
}
