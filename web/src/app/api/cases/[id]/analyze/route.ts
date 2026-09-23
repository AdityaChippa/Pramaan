import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { engineAnalyze } from "@/lib/engine";
import { BUCKETS, objectExists } from "@/lib/storage";
import { isUuid, jsonError } from "@/lib/utils";

export const runtime = "nodejs";

/** Called after the browser finished the signed upload: verifies the object and dispatches the engine job. */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data: row } = await supabase.from("cases").select("id,file_path,status").eq("id", params.id).maybeSingle();
  if (!row) return jsonError("case not found", 404);
  if (row.status === "complete") return jsonError("case already complete", 409);
  if (!row.file_path || !(await objectExists(createAdminSupabase(), BUCKETS.media, row.file_path))) {
    return jsonError("uploaded file not found in storage", 409);
  }
  const r = await engineAnalyze(params.id);
  if (!r.ok) return jsonError(`engine unavailable: ${r.error ?? r.status}`, 503, { retryable: true });
  return Response.json({ case_id: params.id, status: "queued" }, { status: 202 });
}
