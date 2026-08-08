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
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <div
            role="status"
            aria-label="Public beta notice"
            className="relative overflow-hidden border-b border-cyan-300/10 bg-gradient-to-r from-cyan-500/[0.06] via-sky-400/[0.035] to-violet-500/[0.05] px-4 py-2.5 text-slate-300 backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent" />
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs leading-5 sm:text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.08)] sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.75)]" />
                Public Beta
              </span>
              <span className="text-slate-300/90">
                Tri-Proof Protocol is currently in public beta. Features and risk models may evolve as validation continues.
                <span className="hidden sm:inline"> Automated outputs are decision-support signals, not guarantees.</span>
              </span>
            </div>
          </div>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
