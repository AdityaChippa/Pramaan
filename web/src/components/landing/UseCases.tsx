import { StackingCards } from "@/components/ui/StackingCards";
import { LiveProjectButton } from "@/components/ui/LiveProjectButton";
import { FadeIn } from "@/components/ui/FadeIn";
import type { IndicatorCatalogRow } from "@/types/database";
import type { ShowcaseItem } from "./ShowcaseMarquee";
import { UseCaseDemo } from "./UseCaseDemo";

const CASES = [
  { preset: "contact-center", category: "Voice", name: "Contact-Center Voice Fraud", media: ["audio"], steps: ["ingest", "hash", "metadata", "audio", "fusion"], ids: ["aasist", "audio_spectral", "prosody", "breath_pause"] },
  { preset: "kyc", category: "Identity", name: "Video KYC & Conferencing", media: ["video"], steps: ["ingest", "video_frames", "video_temporal", "audio", "fusion"], ids: ["face_cnn", "blink", "rppg", "av_sync"] },
  { preset: "newsroom", category: "Media", name: "Newsroom & Brand Protection", media: ["image", "video"], steps: ["hash", "metadata", "image_detectors", "fusion", "artifacts_upload"], ids: ["univfd", "freq_spectrum", "ela", "c2pa"] },
  { preset: "evidence", category: "Justice", name: "Law-Enforcement Evidence", media: ["image", "video", "audio"], steps: ["ingest", "hash", "metadata", "routing", "fusion", "finalize"], ids: ["exif_metadata", "duplicate", "container", "noise_residual"] },
];

export function UseCases({ catalog, showcase }: { catalog: IndicatorCatalogRow[]; showcase: ShowcaseItem[] }) {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const items = CASES.map((c, i) => (
    <article key={c.preset} className="panel mx-auto w-full max-w-[1400px] p-6 md:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mono text-sm text-muted">{String(i + 1).padStart(2, "0")} · {c.category}</p>
          <h3 className="mt-2 text-4xl font-medium md:text-6xl">{c.name}</h3>
        </div>
        <LiveProjectButton href={`/analyze?preset=${c.preset}`}>Open Detector</LiveProjectButton>
      </div>
      <UseCaseDemo steps={c.steps} indicators={c.ids.map((id) => byId.get(id)).filter((x): x is IndicatorCatalogRow => !!x)}
        example={showcase.find((s) => c.media.includes(s.media_type)) ?? null} />
    </article>
  ));
  return (
    <section id="use-cases" className="px-3 pt-32 md:px-6">
      <FadeIn className="mx-auto mb-10 max-w-[1400px] px-2"><h2 className="hero-heading text-5xl font-semibold tracking-tight md:text-8xl">Where it&apos;s used</h2></FadeIn>
      <StackingCards items={items} />
    </section>
  );
}
