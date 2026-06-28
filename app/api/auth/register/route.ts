import { NextResponse } from "next/server"

import { attachSessionCookie } from "@/lib/auth/session"
import { hashPassword } from "@/lib/auth/password"
import {
  createDevUser,
  findDevUserByEmail,
} from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { registerSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid registration details", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  let existing: { id: string } | null
  try {
    existing = await db.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      const existingDevUser = await findDevUserByEmail(parsed.data.email)
      if (existingDevUser) {
        return NextResponse.json({ error: "Email is already registered" }, { status: 409 })
      }

      const user = await createDevUser({
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
      })
      const response = NextResponse.json({
        user,
        mode: "local-file-store",
      })
      await attachSessionCookie(response, user.id)

      return response
    }

    throw error
  }

  if (existing) {
    return NextResponse.json({ error: "Email is already registered" }, { status: 409 })
  }

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: await hashPassword(parsed.data.password),
    },
    select: { id: true, name: true, email: true },
  })

  const response = NextResponse.json({ user })
  await attachSessionCookie(response, user.id)

  return response
}
