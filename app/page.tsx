import { HomeLegalLinks } from "@/components/landing/home-legal-links"
import { HomeQuickLinks } from "@/components/landing/home-quick-links"
import { LandingPageV2 } from "@/components/landing/landing-page-v2"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <>
      <HomeLegalLinks />
      <LandingPageV2 />
      <HomeQuickLinks />
    </>
  )
}
