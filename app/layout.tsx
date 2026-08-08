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
            className="border-b border-amber-300/20 bg-amber-300/[0.07] px-4 py-2 text-center text-xs leading-5 text-amber-100 sm:text-sm"
          >
            <span className="mr-2 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 sm:text-xs">
              Public Beta
            </span>
            <span>
              Tri-Proof Protocol is currently in beta. Features and risk models may change during validation; automated outputs are decision-support signals, not guarantees.
            </span>
          </div>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
