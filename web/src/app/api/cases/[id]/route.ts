import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { caseUpdateSchema } from "@/lib/validators";
import { BUCKETS, removePrefix } from "@/lib/storage";
import { isUuid, jsonError } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data, error } = await supabase.from("cases").select("*").eq("id", params.id).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("case not found", 404);
  const { data: events } = await supabase.from("case_events").select("*").eq("case_id", params.id).order("id");
  return Response.json({ case: data, events: events ?? [] });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = caseUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid request", 400, { issues: parsed.error.issues });
  const { data, error } = await supabase.from("cases").update(parsed.data).eq("id", params.id).select("id,is_shareable,is_public_showcase").maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("case not found", 404);
  return Response.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data } = await supabase.from("cases").select("id,file_path").eq("id", params.id).maybeSingle();
  if (!data) return jsonError("case not found", 404);
  const admin = createAdminSupabase();
  if (data.file_path) {
    const { count } = await admin.from("cases").select("id", { count: "exact", head: true }).eq("file_path", data.file_path).neq("id", params.id);
    if (!count) await admin.storage.from(BUCKETS.media).remove([data.file_path]);
  }
  await removePrefix(admin, BUCKETS.overlays, `${user.id}/${params.id}`);
  await removePrefix(admin, BUCKETS.reports, `${user.id}/${params.id}`);
  const { error } = await supabase.from("cases").delete().eq("id", params.id);
  if (error) return jsonError(error.message, 500);
  return new Response(null, { status: 204 });
}
