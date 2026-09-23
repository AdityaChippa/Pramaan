import { requireUser } from "@/lib/supabase/server";
import { engineLiveAnalyze } from "@/lib/engine";
import { liveAnalyzeSchema } from "@/lib/validators";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = liveAnalyzeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid request", 400);
  if (!parsed.data.chunk_path.startsWith(`${user.id}/${parsed.data.session_id}/`)) return jsonError("chunk path outside session", 403);
  const { data: session } = await supabase.from("live_sessions").select("id").eq("id", parsed.data.session_id).maybeSingle();
  if (!session) return jsonError("session not found", 404);
  try {
    const r = await engineLiveAnalyze(parsed.data);
    if (r.status !== 200) return jsonError(r.data?.detail ?? "engine error", r.status);
    return Response.json(r.data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "engine unreachable", 503);
  }
}
