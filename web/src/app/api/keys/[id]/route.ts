import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/apikeys";
import { serverEnv } from "@/lib/env";
import { isUuid, jsonError } from "@/lib/utils";

export const runtime = "nodejs";

/** Revoke (soft: keeps usage history and case links). */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid key id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data, error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", params.id).is("revoked_at", null).select("id").maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("key not found or already revoked", 404);
  return new Response(null, { status: 204 });
}

/** Rotate: revokes this key and mints a replacement with the same name and quota. */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid key id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { data: old } = await supabase.from("api_keys").select("id,name,monthly_quota,revoked_at").eq("id", params.id).maybeSingle();
  if (!old) return jsonError("key not found", 404);
  if (old.revoked_at) return jsonError("key already revoked", 409);
  const k = generateApiKey();
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("api_keys")
    .insert({ user_id: user.id, prefix: k.prefix, key_hash: k.hash, name: old.name, monthly_quota: old.monthly_quota ?? serverEnv().API_FREE_MONTHLY_QUOTA })
    .select("id,prefix,name,monthly_quota,created_at").single();
  if (error) return jsonError(error.message, 500);
  await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", params.id);
  return Response.json({ ...data, key: k.key, replaced: params.id }, { status: 201, headers: { "cache-control": "no-store" } });
}
