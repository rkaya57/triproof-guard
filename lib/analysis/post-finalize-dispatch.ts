import { after } from "next/server"

function siteOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    "https://triproofprotocol.com"

  const withProtocol = configured.startsWith("http")
    ? configured
    : `https://${configured}`

  return withProtocol.replace(/\/$/, "")
}

function workerSecret() {
  return (
    process.env.WORKER_SECRET ??
    process.env.ANALYSIS_WORKER_SECRET ??
    process.env.CRON_SECRET ??
    ""
  )
}

async function requestPostFinalizeWorker(analysisId: string) {
  const url = new URL("/api/worker/analysis-post-finalize", siteOrigin())
  url.searchParams.set("analysisId", analysisId)

  const secret = workerSecret()
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => "")
    throw new Error(
      `Analysis post-finalize dispatch failed: ${response.status} ${message.slice(0, 200)}`
    )
  }
}

export function dispatchAnalysisPostFinalize(analysisId: string) {
  after(async () => {
    try {
      await requestPostFinalizeWorker(analysisId)
    } catch (error) {
      console.error("Analysis post-finalize worker dispatch failed", {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
