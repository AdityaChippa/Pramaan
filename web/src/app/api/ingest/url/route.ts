import { requireUser } from "@/lib/supabase/server";
import { urlIngestSchema } from "@/lib/validators";
import { fetchPublicMedia } from "@/lib/ssrf";
import { createCaseFromBytes } from "@/lib/case-create";
import { engineAnalyze } from "@/lib/engine";
import { serverEnv } from "@/lib/env";
import { ACCEPT_MIME, mediaTypeFromMime } from "@/config/indicators";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = urlIngestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid request", 400, { issues: parsed.error.issues });
  try {
    const media = await fetchPublicMedia(parsed.data.url, serverEnv().MAX_UPLOAD_MB * 1024 * 1024, Object.values(ACCEPT_MIME).flat());
    const mediaType = mediaTypeFromMime(media.mime);
    if (!mediaType) return jsonError("unsupported media type", 415);
    const { caseId } = await createCaseFromBytes(
      { userId: user.id, mediaType, source: "url", filename: media.filename, mimeType: media.mime, fileSize: media.bytes.byteLength, preset: parsed.data.preset ?? null },
      media.bytes,
    );
    const r = await engineAnalyze(caseId);
    return Response.json({ case_id: caseId, dispatched: r.ok, engine_error: r.ok ? null : r.error, final_url: media.finalUrl }, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "ingest failed", 422);
  }
}
