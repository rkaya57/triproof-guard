import { NextResponse } from "next/server"

import { getV1ApiUser } from "@/lib/api/v1-auth"
import { listTeamPolicies } from "@/lib/team-policy/store"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await getV1ApiUser(request)
  if (auth.error) return auth.error
  const policies = await listTeamPolicies(auth.user.id)
  return NextResponse.json({ policies: policies.filter((policy) => policy.active).map((policy) => ({ id: policy.id, name: policy.name, rules: policy.rules.filter((rule) => rule.active).map((rule) => ({ type: rule.type, value: rule.value, action: rule.action })) })) }, { headers: { "Cache-Control": "no-store" } })
}
