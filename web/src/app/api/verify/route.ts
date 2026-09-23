import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { verifySchema } from "@/lib/validators";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";

/** Public hash verification through the security-definer RPC (shareable completed cases only). */
async function verify(sha256: string) {
  const env = publicEnv();
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc("verify_hash", { p_sha256: sha256.toLowerCase() });
  if (error) return jsonError(error.message, 500);
  return Response.json({ sha256: sha256.toLowerCase(), matches: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const parsed = verifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("sha256 must be 64 hex characters", 400);
  return verify(parsed.data.sha256);
}

export async function GET(req: Request) {
  const parsed = verifySchema.safeParse({ sha256: new URL(req.url).searchParams.get("sha256") ?? "" });
  if (!parsed.success) return jsonError("sha256 must be 64 hex characters", 400);
  return verify(parsed.data.sha256);
}
