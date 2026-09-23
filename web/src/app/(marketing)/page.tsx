import { createClient } from "@supabase/supabase-js";
import { Hero } from "@/components/landing/Hero";
import { ShowcaseMarquee, type ShowcaseItem } from "@/components/landing/ShowcaseMarquee";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { DetectionModules } from "@/components/landing/DetectionModules";
import { UseCases } from "@/components/landing/UseCases";
import { ModelStrip } from "@/components/landing/ModelStrip";
import { ApiTeaser } from "@/components/landing/ApiTeaser";
import { FooterCta } from "@/components/landing/FooterCta";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { IndicatorCatalogRow, ModelRegistryRow } from "@/types/database";

export const revalidate = 300;

interface ShowcaseRow { case_id: string; media_type: string; verdict: ShowcaseItem["verdict"]; probability: number | null; calibrated: boolean; thumbnail_path: string | null; overlay_path: string | null }

async function loadData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { catalog: [], models: [], showcase: [] };
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const [cat, mod, sc] = await Promise.all([
    anon.from("indicator_catalog").select("*").order("id"),
    anon.from("model_registry").select("*").eq("is_active", true).order("name"),
    anon.rpc("public_showcase", { p_limit: 12 }),
  ]);
  const rows = (sc.data ?? []) as ShowcaseRow[];
  let showcase: ShowcaseItem[] = [];
  if (rows.length) {
    const paths = rows.flatMap((r) => [r.thumbnail_path, r.overlay_path]).filter((p): p is string => !!p);
    let signed: Record<string, string> = {};
    try {
      const { data } = await createAdminSupabase().storage.from("overlays").createSignedUrls(paths, 3600);
      signed = Object.fromEntries((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
    } catch {
      signed = {};
    }
    showcase = rows.map((r) => ({
      case_id: r.case_id, media_type: r.media_type, verdict: r.verdict, probability: r.probability, calibrated: r.calibrated,
      thumbnail_url: r.thumbnail_path ? signed[r.thumbnail_path] ?? null : null, overlay_url: r.overlay_path ? signed[r.overlay_path] ?? null : null,
    }));
  }
  return { catalog: (cat.data ?? []) as IndicatorCatalogRow[], models: (mod.data ?? []) as ModelRegistryRow[], showcase };
}

export default async function LandingPage() {
  const { catalog, models, showcase } = await loadData();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return (
    <>
      <Hero />
      <ShowcaseMarquee items={showcase} catalog={catalog} />
      <HowItWorks />
      <DetectionModules />
      <UseCases catalog={catalog} showcase={showcase} />
      <ModelStrip models={models} />
      <ApiTeaser siteUrl={siteUrl} />
      <FooterCta />
    </>
  );
}
