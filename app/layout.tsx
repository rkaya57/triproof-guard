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
  title: "Tri-Proof Guard | Web3 Wallet Risk Analysis",
  description:
    "Upload wallets, detect suspicious Sybil clusters, and export clean reward winner lists.",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  openGraph: {
    title: "Tri-Proof Guard | Web3 Wallet Risk Analysis",
    description:
      "Upload wallets, detect suspicious Sybil clusters, and export clean reward winner lists.",
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
