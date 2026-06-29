import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { deleteBlogPost } from "@/lib/blog/db"

export const runtime = "nodejs"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 })

  try {
    await deleteBlogPost(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blog post could not be deleted." },
      { status: 500 }
    )
  }
}
