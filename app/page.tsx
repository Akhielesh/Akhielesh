import { CapabilitiesSection } from "@/components/capabilities-section";
import { CareerSection } from "@/components/career-section";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { FeaturedAiProducts } from "@/components/featured-ai-products";
import { HeroSection } from "@/components/hero-section";
import { ImpactSection } from "@/components/impact-section";

export default function HomePage() {
  return (
    <>
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
