import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/apikeys";
import { currentPeriod } from "@/lib/quota";
import { apiKeyCreateSchema } from "@/lib/validators";
import { serverEnv } from "@/lib/env";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const { period } = currentPeriod();
  const [{ data: keys, error }, { data: usage }] = await Promise.all([
    supabase.from("api_keys").select("id,prefix,name,monthly_quota,last_used_at,revoked_at,created_at").order("created_at", { ascending: false }),
    supabase.from("api_usage").select("key_id,count").eq("period_month", period),
  ]);
  if (error) return jsonError(error.message, 500);
  const used = new Map((usage ?? []).map((u) => [u.key_id, u.count]));
  const fallback = serverEnv().API_FREE_MONTHLY_QUOTA;
  return Response.json({ period, keys: (keys ?? []).map((k) => ({ ...k, monthly_quota: k.monthly_quota ?? fallback, used_this_month: used.get(k.id) ?? 0 })) });
}

/** Mints a key. The plaintext is returned exactly once; only its SHA-256 is stored. */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = apiKeyCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("name is required (1–60 characters)", 400);
  const { count } = await supabase.from("api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null);
  if ((count ?? 0) >= 10) return jsonError("limit of 10 active keys reached — revoke one first", 409);
  const k = generateApiKey();
  const { data, error } = await createAdminSupabase().from("api_keys")
    .insert({ user_id: user.id, prefix: k.prefix, key_hash: k.hash, name: parsed.data.name, monthly_quota: serverEnv().API_FREE_MONTHLY_QUOTA })
    .select("id,prefix,name,monthly_quota,created_at").single();
  if (error) return jsonError(error.message, 500);
  return Response.json({ ...data, key: k.key }, { status: 201, headers: { "cache-control": "no-store" } });
}
