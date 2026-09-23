import type { Metadata } from "next";
import { CasesClient } from "@/components/cases/CasesClient";
import { requireUser } from "@/lib/supabase/server";
import type { CaseRow } from "@/types/case";
import type { CaseStats } from "@/types/database";

export const metadata: Metadata = { title: "Cases" };
export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const { supabase } = await requireUser();
  const [{ data }, { data: stats }] = await Promise.all([
    supabase.from("cases").select("id,media_type,source,filename,sha256,status,verdict,probability,calibrated,created_at,file_size").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("my_case_stats"),
  ]);
  const s = Array.isArray(stats) ? (stats[0] as CaseStats | undefined) : undefined;
  return <CasesClient rows={(data ?? []) as CaseRow[]} stats={s ?? null} />;
}
