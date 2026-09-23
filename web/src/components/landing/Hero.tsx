import { SITE } from "@/config/site";
import { ContactButton } from "@/components/ui/ContactButton";
import { FadeIn } from "@/components/ui/FadeIn";
import { Magnet } from "@/components/ui/Magnet";
import { ScanFace } from "@/components/three";

export function Hero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden px-5 pb-8 pt-28 md:px-10 md:pb-10">
      <div className="pointer-events-none absolute inset-0 grid-hairline opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <h1 className="hero-heading relative z-0 select-none text-center text-[21vw] font-black leading-[0.8] tracking-[-0.04em] md:text-[19vw]">
        {SITE.name}
      </h1>
      <div className="absolute left-1/2 top-[46%] z-10 h-[62vw] w-[62vw] max-h-[620px] max-w-[620px] -translate-x-1/2 -translate-y-1/2 md:top-1/2 md:h-[44vw] md:w-[44vw]">
        <Magnet strength={0.12} className="h-full w-full">
          <ScanFace className="h-full w-full" />
        </Magnet>
      </div>
      <div className="relative z-20 mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <FadeIn delay={0.3} y={16}>
          <p className="max-w-xs text-lg leading-snug text-fog md:text-xl">{SITE.tagline}</p>
          <p className="mono mt-2 text-[11px] text-muted">{SITE.event}</p>
        </FadeIn>
        <FadeIn delay={0.45} y={16}>
          <ContactButton href="/analyze" size="lg">Analyze Media</ContactButton>
        </FadeIn>
      </div>
    </section>
  );
}
