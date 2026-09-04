import type { Metadata } from "next"

import { TooltipProvider } from "@/components/ui/tooltip"
import { ToastProvider } from "@/components/ui/toast"
import "./globals.css"
import "./premium-ui.css"

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://triproofprotocol.com")

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tri-Proof Protocol | Web3 Security Platform",
  description:
    "Protect users before signatures, reward campaigns before distribution, and Telegram communities before scam risk spreads.",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  openGraph: {
    title: "Tri-Proof Protocol | Web3 Security Platform",
    description:
      "ScamGuard, Sybil Analyst, and community protection in one explainable Web3 security platform.",
    images: ["/logo.svg"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <div
            role="status"
            aria-label="Public beta notice"
            className="relative overflow-hidden border-b border-white/[0.055] bg-[#06101c]/88 px-4 py-2 text-slate-300 backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/18 to-transparent" />
            <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center text-[11px] leading-5 sm:text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/16 bg-cyan-300/[0.055] px-2.5 py-0.5 font-semibold uppercase tracking-[0.14em] text-cyan-200">
                <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_7px_rgba(103,232,249,0.6)]" />
                Public Beta
              </span>
              <span className="text-slate-400">
                Risk models continue to evolve during validation.
                <span className="hidden md:inline"> Automated outputs support decisions; they are not guarantees.</span>
              </span>
            </div>
          </div>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
