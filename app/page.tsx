import { HomeBlogSection } from "@/components/landing/home-blog-section"
import { LandingPage } from "@/components/landing/landing-page"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <>
      <LandingPage />
      <HomeBlogSection />
    </>
  )
}
