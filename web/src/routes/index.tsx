import { createFileRoute } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import Footer from "@/components/Footer";
import {
  Details,
  Faq,
  FinalCta,
  Hero,
  OnThePr,
  ScannerRow,
  Skills,
  WaysToRun,
  WhatsNew,
} from "@/components/landing/Sections";
import Navbar from "@/components/Navbar";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="paper min-h-screen overflow-x-clip bg-paper font-sans text-ink">
        <Navbar />
        <main>
          <Hero />
          <ScannerRow />
          <WhatsNew />
          <OnThePr />
          <Skills />
          <Details />
          <WaysToRun />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
