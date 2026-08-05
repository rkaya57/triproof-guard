import { HomeQuickLinks } from "@/components/landing/home-quick-links"
import { LandingPage } from "@/components/landing/landing-page"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <>
      <LandingPage />
      <HomeQuickLinks />
    </>
  )
}
