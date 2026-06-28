import { NextResponse } from "next/server"

import { getDemoAnalysis } from "@/lib/demo-data"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ analysis: getDemoAnalysis() })
}
