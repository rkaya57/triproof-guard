import { publicDemoSnapshot } from "@/lib/demo/public-snapshot"
import { publicDemoCsv, publicDemoPdf } from "@/lib/demo/public-exports"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "json"
  const headers = { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" }
  if (format === "json") return Response.json(publicDemoSnapshot, { headers: { ...headers, "Content-Disposition": 'attachment; filename="triproof-demo.json"' } })
  if (format === "csv") return new Response(publicDemoCsv(publicDemoSnapshot), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="triproof-demo.csv"' } })
  if (format === "pdf") {
    const bytes = await publicDemoPdf(publicDemoSnapshot)
    return new Response(new Uint8Array(bytes).buffer, { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="triproof-demo.pdf"' } })
  }
  return Response.json({ error: "Unsupported format. Use csv, pdf or json." }, { status: 400 })
}
