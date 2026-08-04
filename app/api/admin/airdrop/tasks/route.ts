import { NextResponse } from "next/server"
import type { AirdropTaskType } from "@prisma/client"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import {
  AIRDROP_TASK_TYPES,
  airdropSchemaMissingResponse,
  ensureAirdropTasks,
  isAirdropSchemaMissing,
  isLikelyUrl,
  isXUrl,
} from "@/lib/airdrop/tasks"

export const runtime = "nodejs"

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function parseTaskBody(body: unknown) {
  const input = body as {
    id?: string
    title?: string
    description?: string
    targetUrl?: string
    type?: AirdropTaskType
    points?: number | string
    proofRequired?: boolean
    active?: boolean
    sortOrder?: number | string
  } | null

  const title = input?.title?.trim() ?? ""
  const description = input?.description?.trim() ?? ""
  const targetUrl = input?.targetUrl?.trim() || null
  const type = input?.type
  const points = Number(input?.points)
  const sortOrder = Number(input?.sortOrder ?? 100)

  if (title.length < 3) return { error: "Task title is required." }
  if (description.length < 10) return { error: "Task description must be at least 10 characters." }
  if (!type || !AIRDROP_TASK_TYPES.includes(type)) return { error: "Select a valid task type." }
  if (targetUrl && (targetUrl.length > 2048 || !isLikelyUrl(targetUrl))) {
    return { error: "Task link must be a valid http or https URL." }
  }
  if (type === "X_QUOTE" && (!targetUrl || !isXUrl(targetUrl))) {
    return { error: "X quote tasks require a valid X post or profile link." }
  }
  if (!Number.isInteger(points) || points <= 0 || points > 100000) {
    return { error: "Points must be a positive whole number." }
  }

  return {
    data: {
      title,
      description,
      targetUrl,
      type,
      points,
      proofRequired: Boolean(input?.proofRequired),
      active: input?.active !== false,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
    },
    id: input?.id?.trim(),
  }
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  try {
    await ensureAirdropTasks(db)
    const tasks = await db.airdropTask.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { submissions: true } },
      },
    })

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        slug: task.slug,
        title: task.title,
        description: task.description,
        targetUrl: task.targetUrl,
        type: task.type,
        points: task.points,
        proofRequired: task.proofRequired,
        active: task.active,
        sortOrder: task.sortOrder,
        submissionCount: task._count.submissions,
      })),
    })
  } catch (error) {
    if (isAirdropSchemaMissing(error)) {
      return NextResponse.json(airdropSchemaMissingResponse(), { status: 503 })
    }

    console.error("Airdrop tasks load failed", error)
    return NextResponse.json({ error: "Could not load airdrop tasks." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = parseTaskBody(await request.json().catch(() => null))
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const task = await db.airdropTask.create({
      data: {
        ...parsed.data,
        slug: slugify(parsed.data.title),
      },
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    if (isAirdropSchemaMissing(error)) {
      return NextResponse.json(airdropSchemaMissingResponse(), { status: 503 })
    }

    console.error("Airdrop task create failed", error)
    return NextResponse.json({ error: "Could not create airdrop task. Check for duplicate titles." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = parseTaskBody(await request.json().catch(() => null))
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!parsed.id) return NextResponse.json({ error: "Task id is required." }, { status: 400 })

  try {
    const task = await db.airdropTask.update({
      where: { id: parsed.id },
      data: parsed.data,
    })

    return NextResponse.json({ task })
  } catch (error) {
    if (isAirdropSchemaMissing(error)) {
      return NextResponse.json(airdropSchemaMissingResponse(), { status: 503 })
    }

    console.error("Airdrop task update failed", error)
    return NextResponse.json({ error: "Could not update airdrop task." }, { status: 500 })
  }
}
