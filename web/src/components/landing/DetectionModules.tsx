import { FadeIn } from "@/components/ui/FadeIn";

const MODULES = [
  { n: "01", name: "Image Forensics", desc: "EfficientNet-B4 face CNN with in-graph CAM heatmaps, UnivFD CLIP probe, FFT spectrum, blending boundary, ELA, noise residual and lighting consistency." },
  { n: "02", name: "Video & Biological Signals", desc: "Per-frame score timeline, Procrustes-aligned landmark jitter, eye-aspect-ratio blink dynamics, POS rPPG pulse coherence across forehead and cheeks, and AV sync." },
  { n: "03", name: "Voice Anti-Spoofing", desc: "AASIST-L graph-attention spoof scores on 4 s windows, vocoder band-limiting, Praat prosody (jitter, shimmer, HNR), breath pattern and splice discontinuities." },
  { n: "04", name: "Metadata & Provenance", desc: "SHA-256 and pHash at ingestion, EXIF/XMP and generator text chunks, thumbnail mismatch, container encoder traces and C2PA Content Credentials validation." },
  { n: "05", name: "Live Monitor", desc: "Webcam and microphone analyzed in rolling 3-second windows — face CNN, blink, jitter and AASIST-L — with a live 60-second risk timeline." },
];

export function DetectionModules() {
  return (
    <section id="modules" className="px-3 md:px-6">
      <div className="rounded-[40px] bg-white px-6 py-20 text-ink md:rounded-[64px] md:px-16 md:py-28">
        <FadeIn><h2 className="text-5xl font-semibold tracking-tight md:text-8xl">Detection modules</h2></FadeIn>
        <ul className="mt-14 divide-y divide-ink/10 border-y border-ink/10">
          {MODULES.map((m, i) => (
            <li key={m.n}>
              <FadeIn delay={i * 0.05} className="grid gap-4 py-8 md:grid-cols-[120px_1fr_1.3fr] md:items-baseline md:py-10">
                <span className="mono text-sm text-ink/50">{m.n}</span>
                <span className="text-3xl font-medium md:text-5xl">{m.name}</span>
                <span className="text-base text-ink/70 md:text-lg">{m.desc}</span>
              </FadeIn>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
