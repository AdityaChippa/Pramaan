import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { ModelCardView } from "@/components/model/ModelCardView";
import type { IndicatorCatalogRow, ModelRegistryRow } from "@/types/database";

export const metadata: Metadata = { title: "Model card" };
export const revalidate = 120;

export default async function ModelPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let models: ModelRegistryRow[] = [];
  let catalog: IndicatorCatalogRow[] = [];
  if (url && anon) {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const [m, c] = await Promise.all([
      sb.from("model_registry").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("indicator_catalog").select("*").order("id"),
    ]);
    models = (m.data ?? []) as ModelRegistryRow[];
    catalog = (c.data ?? []) as IndicatorCatalogRow[];
  }
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-36 md:px-10">
      <p className="label-xs">Transparency</p>
      <h1 className="hero-heading mb-12 text-5xl font-semibold md:text-8xl">MODEL CARD</h1>
      <ModelCardView models={models} catalog={catalog} />
    </div>
  );
}
