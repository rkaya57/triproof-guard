import { AAdsUnit } from "@/components/ads/aads-unit"
import { HomeBlogSection } from "@/components/landing/home-blog-section"
import { LandingPage } from "@/components/landing/landing-page"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <>
      <LandingPage />
      <section className="premium-page hidden border-y border-border/60 bg-background px-5 py-10 text-foreground sm:px-8 lg:block">
        <AAdsUnit placement="home-between-product-and-blog" />
      </section>
      <HomeBlogSection />
    </>
  )
}
