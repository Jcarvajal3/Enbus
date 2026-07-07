import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Benefits } from "@/components/landing/benefits";
import { PopularRoutes } from "@/components/landing/popular-routes";
import { CalculatorCTA } from "@/components/landing/calculator-cta";
import { Testimonials } from "@/components/landing/testimonials";
import { AppDownload } from "@/components/landing/app-download";
import { Footer } from "@/components/landing/footer";

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
  );
}
