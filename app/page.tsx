import { CapabilitiesSection } from "@/components/capabilities-section";
import { CareerSection } from "@/components/career-section";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { FeaturedAiProducts } from "@/components/featured-ai-products";
import { HeroSection } from "@/components/hero-section";
import { ImpactSection } from "@/components/impact-section";
import { LandingSequence } from "@/components/landing-sequence";

export default function HomePage() {
  return (
    <>
      <LandingSequence />
      <HeroSection />
      <ImpactSection />
      <FeaturedAiProducts />
      <CapabilitiesSection />
      <CareerSection />
      <EducationSection />
      <ContactSection />
    </>
  );
}
