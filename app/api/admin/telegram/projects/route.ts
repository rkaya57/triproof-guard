import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import {
  createTelegramProjectRegistry,
  deleteTelegramProjectRegistry,
  listTelegramProjectRegistry,
  updateTelegramProjectRegistry,
} from "@/lib/telegram/project-registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
}

const assetSchema = z.object({
  kind: z.enum([
    "DOMAIN",
    "X_HANDLE",
    "TELEGRAM_HANDLE",
    "EVM_ADDRESS",
    "SOLANA_ADDRESS",
    "BRAND_ALIAS",
  ]),
  value: z.string().trim().min(1).max(500),
  chain: z.string().trim().max(30).optional(),
})

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  assets: z.array(assetSchema).min(1).max(30),
})

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().optional(),
})

const deleteSchema = z.object({
  id: z.string().min(1),
})

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)
  return json({ projects: await listTelegramProjectRegistry({ includeInactive: true }) })
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: "Invalid verified project registry entry" }, 400)

  try {
    const project = await createTelegramProjectRegistry(parsed.data)
    return json({ project }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project registry entry could not be created"
    const conflict = /unique|duplicate|already/i.test(message)
    return json({ error: message }, conflict ? 409 : 500)
  }
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: "Invalid verified project update" }, 400)
  if (Object.keys(parsed.data).length <= 1) return json({ error: "No project changes were provided" }, 400)

  const project = await updateTelegramProjectRegistry(parsed.data)
  if (!project) return json({ error: "Verified project was not found" }, 404)
  return json({ project })
}

export async function DELETE(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: "Project id is required" }, 400)
  const deleted = await deleteTelegramProjectRegistry(parsed.data.id)
  return deleted ? json({ ok: true }) : json({ error: "Verified project was not found" }, 404)
}
