import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { runInternalAdjudication } from "@/lib/benchmark/internal-adjudication"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_REVIEWER_BYTES = 2 * 1024 * 1024
const MAX_SECOND_REVIEW_BYTES = 2 * 1024 * 1024
const MAX_SEAL_BYTES = 12 * 1024 * 1024

function fileFrom(formData: FormData, key: string) {
  const value = formData.get(key)
  return value instanceof File ? value : null
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const reviewerFile = fileFrom(formData, "reviewerCsv")
    const sealFile = fileFrom(formData, "privateSeal")
    const secondReviewFile = fileFrom(formData, "secondReviewCsv")

    if (!reviewerFile || !sealFile || !secondReviewFile) {
      return NextResponse.json(
        { error: "reviewerCsv, privateSeal and secondReviewCsv files are required" },
        { status: 400 }
      )
    }
    if (reviewerFile.size <= 0 || reviewerFile.size > MAX_REVIEWER_BYTES) {
      return NextResponse.json({ error: "Reviewer CSV exceeds the allowed size" }, { status: 413 })
    }
    if (secondReviewFile.size <= 0 || secondReviewFile.size > MAX_SECOND_REVIEW_BYTES) {
      return NextResponse.json({ error: "Second-review CSV exceeds the allowed size" }, { status: 413 })
    }
    if (sealFile.size <= 0 || sealFile.size > MAX_SEAL_BYTES) {
      return NextResponse.json(
        { error: "Private seal exceeds the allowed size; upload the original .json.gz seal" },
        { status: 413 }
      )
    }

    const reviewerCsv = await reviewerFile.text()
    const secondReviewCsv = await secondReviewFile.text()
    const privateSealBytes = new Uint8Array(await sealFile.arrayBuffer())
    const result = runInternalAdjudication(reviewerCsv, privateSealBytes, secondReviewCsv)

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Internal adjudication failed", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal adjudication could not be completed",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  }
}
