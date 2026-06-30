import { POST as verifySolanaPost } from "@/app/api/billing/verify-solana/route"

export const runtime = "nodejs"

export async function POST(request: Request) {
  return verifySolanaPost(request)
}
