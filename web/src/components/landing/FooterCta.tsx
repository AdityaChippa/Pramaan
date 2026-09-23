import { ContactButton } from "@/components/ui/ContactButton";
import { LiveProjectButton } from "@/components/ui/LiveProjectButton";
import { FadeIn } from "@/components/ui/FadeIn";

export function FooterCta() {
  return (
    <section className="flex flex-col items-center px-5 py-32 text-center md:py-48">
      <FadeIn><h2 className="hero-heading text-[14vw] font-black leading-[0.85] tracking-tight md:text-[11vw]">PROVE IT.</h2></FadeIn>
      <FadeIn delay={0.2} className="mt-10 flex flex-wrap justify-center gap-4">
        <ContactButton href="/analyze" size="lg">Analyze Media</ContactButton>
        <LiveProjectButton href="/live">Start Live Monitor</LiveProjectButton>
      </FadeIn>
    </section>
  );
}
