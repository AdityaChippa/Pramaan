import type { Metadata } from "next";
import { AnalyzeClient } from "@/components/analyze/AnalyzeClient";
import { PRESETS } from "@/config/indicators";

export const metadata: Metadata = { title: "Analyze" };

export default function AnalyzePage({ searchParams }: { searchParams: { preset?: string } }) {
  const preset = searchParams.preset && PRESETS[searchParams.preset] ? searchParams.preset : null;
  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 50) || 50;
  return <AnalyzeClient preset={preset} maxMb={maxMb} />;
}
