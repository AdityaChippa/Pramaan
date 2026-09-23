import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { liveChunkSchema } from "@/lib/validators";
import { BUCKETS, signedUploadUrl } from "@/lib/storage";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";

/** Returns a signed upload URL for one 3-second chunk under live-chunks/<user>/<session>/. */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = liveChunkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid request", 400, { issues: parsed.error.issues });
  const { data: session } = await supabase.from("live_sessions").select("id,ended_at").eq("id", parsed.data.session_id).maybeSingle();
  if (!session) return jsonError("session not found", 404);
  if (session.ended_at) return jsonError("session already ended", 409);
  const ext = parsed.data.mime_type === "video/mp4" ? "mp4" : "webm";
  const path = `${user.id}/${parsed.data.session_id}/${String(parsed.data.chunk_index).padStart(5, "0")}.${ext}`;
  try {
    const up = await signedUploadUrl(createAdminSupabase(), BUCKETS.live, path);
    return Response.json({ path, signedUrl: up.signedUrl });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "could not sign upload", 500);
  }
}
