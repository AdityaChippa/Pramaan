import { requireUser } from "@/lib/supabase/server";
import { insertCase } from "@/lib/case-create";
import { engineAnalyze } from "@/lib/engine";
import { isUuid, jsonError } from "@/lib/utils";
import type { CaseRow } from "@/types/case";

export const runtime = "nodejs";

/** Re-analysis with the currently active models creates a linked new case; the original stays untouched for custody. */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data } = await supabase.from("cases").select("*").eq("id", params.id).maybeSingle();
  const old = data as CaseRow | null;
  if (!old) return jsonError("case not found", 404);
  if (!old.file_path || old.source === "live") return jsonError("this case has no stored media to re-analyze", 422);
  const created = await insertCase({
    userId: user.id,
    mediaType: old.media_type,
    source: old.source,
    filename: old.filename ?? "media",
    mimeType: old.mime_type ?? "application/octet-stream",
    fileSize: old.file_size ?? 0,
    clientSha256: old.sha256 ?? old.client_sha256,
    durationS: old.duration_s,
    preset: old.preset,
    parentCaseId: old.id,
    filePath: old.file_path,
  });
  const r = await engineAnalyze(created.id);
  return Response.json({ case_id: created.id, dispatched: r.ok, engine_error: r.ok ? null : r.error }, { status: 201 });
}
