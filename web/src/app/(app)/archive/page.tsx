import type { Metadata } from "next";
import { ArchiveClient } from "@/components/archive/ArchiveClient";
import { requireUser } from "@/lib/supabase/server";
import type { CaseRow } from "@/types/case";

export const metadata: Metadata = { title: "Archive" };
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("cases")
    .select("id,media_type,source,filename,sha256,status,verdict,probability,calibrated,created_at,completed_at,duration_s,file_size,artifacts,indicators")
    .order("created_at", { ascending: false })
    .limit(500);
  return <ArchiveClient rows={(data ?? []) as CaseRow[]} />;
}
