/** Single source of truth for product naming. Rename the product here only. */
export const SITE = {
  name: "PRAMAAN",
  meaning: "Sanskrit/Hindi: proof",
  tagline: "explainable forensics for synthetic media",
  description:
    "PRAMAAN analyzes images, video and audio for manipulation and AI generation, fuses learned detectors with handcrafted forensic indicators, and explains every score with measured evidence.",
  event: "Forensic Frontiers 2026 · SRM × NFSU · Theme 2",
} as const;

export const NAV_LINKS = [
  { label: "Platform", href: "/#modules" },
  { label: "Live", href: "/live" },
  { label: "Archive", href: "/archive" },
  { label: "API", href: "/docs/api" },
  { label: "Model Card", href: "/model" },
] as const;

export const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1];
