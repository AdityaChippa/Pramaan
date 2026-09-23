import { requireUser } from "@/lib/supabase/server";
import { createCaseSchema } from "@/lib/validators";
import { createCaseWithUpload } from "@/lib/case-create";
import { serverEnv } from "@/lib/env";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";

/** Creates a queued case and returns a signed upload URL (the browser uploads directly to Storage). */
export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = createCaseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid request", 400, { issues: parsed.error.issues });
  const b = parsed.data;
  const env = serverEnv();
  if (b.file_size > env.MAX_UPLOAD_MB * 1024 * 1024) return jsonError(`file exceeds ${env.MAX_UPLOAD_MB} MB`, 413);
  try {
    const out = await createCaseWithUpload({
      userId: user.id,
      mediaType: b.media_type,
      source: b.source,
      filename: b.filename,
      mimeType: b.mime_type.split(";")[0],
      fileSize: b.file_size,
      clientSha256: b.client_sha256,
      durationS: b.duration_s ?? null,
      preset: b.preset ?? null,
    });
    return Response.json(out, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "could not create case", 500);
  }
}

export async function GET(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 300) || 300, 500);
  const { data, error } = await supabase
    .from("cases")
    .select("id,media_type,source,filename,sha256,status,verdict,probability,calibrated,created_at,completed_at,duration_s,file_size,artifacts,is_shareable")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return jsonError(error.message, 500);
  return Response.json({ cases: data });
}
