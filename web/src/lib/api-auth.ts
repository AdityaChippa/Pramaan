import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { hashApiKey, looksLikeApiKey } from "@/lib/apikeys";
import { serverEnv } from "@/lib/env";

export interface ApiPrincipal { keyId: string; userId: string; limit: number }

/** Resolves `Authorization: Bearer pk_...` to a non-revoked key. Returns a ready 401 response on failure. */
export async function authenticateApiKey(req: Request): Promise<{ ok: true; principal: ApiPrincipal } | { ok: false; response: Response }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const unauthorized = (message: string) => ({
    ok: false as const,
    response: Response.json({ error: message }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="pramaan"' } }),
  });
  if (!looksLikeApiKey(token)) return unauthorized("missing or malformed API key");
  const { data, error } = await createAdminSupabase()
    .from("api_keys").select("id,user_id,monthly_quota,revoked_at").eq("key_hash", hashApiKey(token)).maybeSingle();
  if (error) return { ok: false, response: Response.json({ error: "key lookup failed" }, { status: 500 }) };
  if (!data || data.revoked_at) return unauthorized("invalid or revoked API key");
  return { ok: true, principal: { keyId: data.id, userId: data.user_id, limit: data.monthly_quota ?? serverEnv().API_FREE_MONTHLY_QUOTA } };
}
