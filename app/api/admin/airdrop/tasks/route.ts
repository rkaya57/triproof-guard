import { Prisma, type AirdropTaskType } from "@prisma/client"
import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import {
  AIRDROP_TASK_TYPES,
  airdropSchemaMissingResponse,
  airdropTaskSlugBase,
  airdropTaskSlugCandidate,
  ensureAirdropTasks,
  isAirdropSchemaMissing,
  isLikelyUrl,
  isXUrl,
} from "@/lib/airdrop/tasks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
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

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

async function createTaskWithUniqueSlug(data: ReturnType<typeof parseTaskBody> extends { data: infer T } ? T : never) {
  const baseSlug = airdropTaskSlugBase(data.title, data.targetUrl)

  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      return await db.airdropTask.create({
        data: {
          ...data,
          slug: airdropTaskSlugCandidate(baseSlug, attempt),
        },
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) continue
      throw error
    }
  }

  throw new Error("Could not allocate a unique task identifier.")
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  try {
    await ensureAirdropTasks(db)
    const tasks = await db.airdropTask.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { submissions: true } },
      },
    })

    return json({
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
      return json(airdropSchemaMissingResponse(), 503)
    }

    console.error("Airdrop tasks load failed", error)
    return json({ error: "Could not load airdrop tasks." }, 500)
  }
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  const parsed = parseTaskBody(await request.json().catch(() => null))
  if ("error" in parsed) return json({ error: parsed.error }, 400)

  try {
    if (parsed.data.targetUrl) {
      const duplicateTarget = await db.airdropTask.findFirst({
        where: {
          type: parsed.data.type,
          targetUrl: parsed.data.targetUrl,
        },
        select: { id: true, title: true },
      })
      if (duplicateTarget) {
        return json(
          {
            error: `A ${parsed.data.type} task for this exact link already exists: ${duplicateTarget.title}`,
            code: "AIRDROP_TASK_LINK_EXISTS",
            existingTaskId: duplicateTarget.id,
          },
          409
        )
      }
    }

    const task = await createTaskWithUniqueSlug(parsed.data)
    return json({ task }, 201)
  } catch (error) {
    if (isAirdropSchemaMissing(error)) {
      return json(airdropSchemaMissingResponse(), 503)
    }

    console.error("Airdrop task create failed", error)
    return json({ error: "Could not create the airdrop task." }, 500)
  }
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  const parsed = parseTaskBody(await request.json().catch(() => null))
  if ("error" in parsed) return json({ error: parsed.error }, 400)
  if (!parsed.id) return json({ error: "Task id is required." }, 400)

  try {
    if (parsed.data.targetUrl) {
      const duplicateTarget = await db.airdropTask.findFirst({
        where: {
          id: { not: parsed.id },
          type: parsed.data.type,
          targetUrl: parsed.data.targetUrl,
        },
        select: { id: true, title: true },
      })
      if (duplicateTarget) {
        return json(
          {
            error: `Another ${parsed.data.type} task already uses this exact link: ${duplicateTarget.title}`,
            code: "AIRDROP_TASK_LINK_EXISTS",
            existingTaskId: duplicateTarget.id,
          },
          409
        )
      }
    }

    const task = await db.airdropTask.update({
      where: { id: parsed.id },
      data: parsed.data,
    })

    return json({ task })
  } catch (error) {
    if (isAirdropSchemaMissing(error)) {
      return json(airdropSchemaMissingResponse(), 503)
    }

    console.error("Airdrop task update failed", error)
    return json({ error: "Could not update the airdrop task." }, 500)
  }
}
