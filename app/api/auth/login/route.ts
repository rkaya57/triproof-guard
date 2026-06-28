import { NextResponse } from "next/server"

import { attachSessionCookie } from "@/lib/auth/session"
import { verifyPassword } from "@/lib/auth/password"
import { getDevUserWithPasswordByEmail } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { authSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = authSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login details" }, { status: 400 })
  }

  let user
  try {
    user = await db.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      const devUser = await getDevUserWithPasswordByEmail(parsed.data.email)
      if (
        !devUser ||
        !(await verifyPassword(parsed.data.password, devUser.passwordHash))
      ) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        )
      }

      const response = NextResponse.json({
        user: { id: devUser.id, name: devUser.name, email: devUser.email },
        mode: "local-file-store",
      })
      await attachSessionCookie(response, devUser.id)

      return response
    }

    throw error
  }

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  })
  await attachSessionCookie(response, user.id)

  return response
}
