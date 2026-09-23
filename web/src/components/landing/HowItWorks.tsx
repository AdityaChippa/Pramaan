import { AnimatedText } from "@/components/ui/AnimatedText";
import { FadeIn } from "@/components/ui/FadeIn";
import { CornerObject } from "@/components/three";
import { SITE } from "@/config/site";

const TEXT = `${SITE.name} hashes every file the moment it arrives, then routes it by modality. Images face a learned face-manipulation CNN, a CLIP-based generic generator detector, frequency, blending, error-level, noise and lighting analysis. Video adds per-frame scores, landmark jitter, blink dynamics, a remote-photoplethysmography pulse test and audio-visual sync. Audio runs AASIST-L anti-spoofing, spectral, prosody, breath and splice checks. Metadata and C2PA credentials are inspected for provenance. A logistic fusion model turns every measured indicator into exact log-odds contributions and a three-band verdict — and every step is timestamped in the chain of custody.`;

export function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-[1600px] px-5 py-32 md:px-10 md:py-48">
      <FadeIn x={-60} y={0} className="absolute left-2 top-10 hidden h-40 w-40 md:block lg:left-10 lg:h-52 lg:w-52"><CornerObject kind="frame" className="h-full w-full" /></FadeIn>
      <FadeIn x={60} y={0} delay={0.1} className="absolute right-2 top-16 hidden h-40 w-52 md:block lg:right-10 lg:h-48 lg:w-64"><CornerObject kind="waveform" className="h-full w-full" /></FadeIn>
      <FadeIn x={-60} y={0} delay={0.2} className="absolute bottom-10 left-2 hidden h-40 w-52 md:block lg:left-10 lg:h-48 lg:w-64"><CornerObject kind="filmstrip" className="h-full w-full" /></FadeIn>
      <FadeIn x={60} y={0} delay={0.3} className="absolute bottom-16 right-2 hidden h-40 w-40 md:block lg:right-10 lg:h-52 lg:w-52"><CornerObject kind="tag" className="h-full w-full" /></FadeIn>
      <div className="relative mx-auto max-w-4xl text-center">
        <FadeIn><h2 className="hero-heading text-5xl font-semibold tracking-tight md:text-8xl">HOW IT WORKS</h2></FadeIn>
        <AnimatedText text={TEXT} className="mt-12 text-2xl leading-snug md:text-4xl" />
      </div>
    </section>
  );
}
