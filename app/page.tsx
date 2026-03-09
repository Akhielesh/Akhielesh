import { CapabilitiesSection } from "@/components/capabilities-section";
import { CareerSection } from "@/components/career-section";
import { ContactSection } from "@/components/contact-section";
import { DataBackboneSection } from "@/components/data-backbone-section";
import { FeaturedAiProducts } from "@/components/featured-ai-products";
import { HeroSection } from "@/components/hero-section";
import { LandingSequence } from "@/components/landing-sequence";
import { LiveSignalSection } from "@/components/live-signal-section";
import { WritingSection } from "@/components/writing-section";

export default function HomePage() {
  return (
    <>
      <LandingSequence />
      <HeroSection />
      <FeaturedAiProducts />
      <CapabilitiesSection />
      <DataBackboneSection />
      <CareerSection />
      <LiveSignalSection />
      <WritingSection />
      <ContactSection />
    </>
  );
}
