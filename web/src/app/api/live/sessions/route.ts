import { requireUser } from "@/lib/supabase/server";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data, error } = await supabase.from("live_sessions").insert({ user_id: user.id }).select("id,started_at").single();
  if (error) return jsonError(error.message, 500);
  return Response.json(data, { status: 201 });
}

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data, error } = await supabase.from("live_sessions").select("*").order("started_at", { ascending: false }).limit(50);
  if (error) return jsonError(error.message, 500);
  return Response.json({ sessions: data });
}
