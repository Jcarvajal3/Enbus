import { Navbar } from "@/components/navbar"
import { Hero } from "@/components/hero"
import { HowItWorks } from "@/components/how-it-works"
import { Benefits } from "@/components/benefits"
import { PopularRoutes } from "@/components/popular-routes"
import { CalculatorCTA } from "@/components/calculator-cta"
import { Testimonials } from "@/components/testimonials"
import { AppDownload } from "@/components/app-download"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <Benefits />
        <PopularRoutes />
        <CalculatorCTA />
        <Testimonials />
        <AppDownload />
      </main>
      <Footer />
    </>
  )
}
