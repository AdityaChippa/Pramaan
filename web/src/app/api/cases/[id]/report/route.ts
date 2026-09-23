import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildCaseJson } from "@/lib/case-json";
import { checkGrounding } from "@/lib/grounding";
import { GROUNDING_RULES, groqErrorMessage, groqJson, groqModel } from "@/lib/groq";
import { isUuid, jsonError } from "@/lib/utils";
import type { CaseEvent, CaseRow } from "@/types/case";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `${GROUNDING_RULES}
Task: write a technical forensic report for an expert reader.
JSON schema:
{"title": string,
 "overall_assessment": string,
 "findings": [{"indicator_id": string, "indicator_name": string, "observation": string, "interpretation": string}],
 "fusion_explanation": string,
 "limitations": [string],
 "what_would_change_conclusion": [string]}
Include one finding per indicator with status "ok", ordered by absolute fusion contribution; mention not-applicable indicators in limitations.`;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data } = await supabase.from("cases").select("*").eq("id", params.id).maybeSingle();
  const row = data as CaseRow | null;
  if (!row) return jsonError("case not found", 404);
  if (row.status !== "complete") return jsonError("case is not complete", 409);
  const regenerate = new URL(req.url).searchParams.get("regenerate") === "1";
  if (row.report && !regenerate) return Response.json(row.report);

  const { data: events } = await supabase.from("case_events").select("*").eq("case_id", params.id).order("id");
  const input = buildCaseJson(row, (events ?? []) as CaseEvent[]);
  const user_msg = `Case evidence JSON:\n${JSON.stringify(input)}`;
  try {
    let content = await groqJson<Record<string, unknown>>(SYSTEM, user_msg, 3500);
    let check = checkGrounding(content, input);
    if (!check.ok) {
      content = await groqJson<Record<string, unknown>>(
        `${SYSTEM}\nYour previous draft contained numbers not present in the evidence (${check.unsupported.join(", ")}). Remove or correct them.`, user_msg, 3500);
      check = checkGrounding(content, input);
    }
    const doc = { generated_at: new Date().toISOString(), model: groqModel(), grounding_warning: !check.ok, unsupported_numbers: check.unsupported, content };
    await createAdminSupabase().from("cases").update({ report: doc }).eq("id", params.id);
    return Response.json(doc);
  } catch (e) {
    const g = groqErrorMessage(e);
    return jsonError(g.message, g.status);
  }
}
