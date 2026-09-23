import { requireUser } from "@/lib/supabase/server";
import { engineLiveFinalize } from "@/lib/engine";
import { isUuid, jsonError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid session id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data: session } = await supabase.from("live_sessions").select("*").eq("id", params.id).maybeSingle();
  if (!session) return jsonError("session not found", 404);
  const { data: windows } = await supabase.from("live_windows").select("*").eq("session_id", params.id).order("chunk_index");
  return Response.json({ session, windows: windows ?? [] });
}

/** Ends the session: the engine aggregates all windows into a single case with a custody entry. */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid session id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data: session } = await supabase.from("live_sessions").select("id,case_id").eq("id", params.id).maybeSingle();
  if (!session) return jsonError("session not found", 404);
  if (session.case_id) return Response.json({ case_id: session.case_id });
  try {
    const r = await engineLiveFinalize(params.id);
    if (r.status !== 200) return jsonError(r.data?.detail ?? "finalize failed", r.status);
    return Response.json(r.data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "engine unreachable", 503);
  }
}
