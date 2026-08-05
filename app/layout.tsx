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
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  )
}
