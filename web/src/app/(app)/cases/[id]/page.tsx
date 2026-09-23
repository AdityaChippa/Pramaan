import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultClient } from "@/components/result/ResultClient";
import { requireUser } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { CaseEvent, CaseRow } from "@/types/case";
import type { ChatMessageRow } from "@/types/database";

export const metadata: Metadata = { title: "Case result" };
export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound();
  const { supabase } = await requireUser();
  const { data } = await supabase.from("cases").select("*").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const [{ data: events }, { data: messages }] = await Promise.all([
    supabase.from("case_events").select("*").eq("case_id", params.id).order("id"),
    supabase.from("chat_messages").select("*").eq("case_id", params.id).order("id"),
  ]);
  return (
    <ResultClient
      initialCase={data as CaseRow}
      initialEvents={(events ?? []) as CaseEvent[]}
      messages={(messages ?? []) as ChatMessageRow[]}
      siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}
    />
  );
}
