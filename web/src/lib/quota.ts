import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export function currentPeriod(now = new Date()): { period: string; resetEpoch: number } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { period: start.toISOString().slice(0, 10), resetEpoch: Math.floor(next.getTime() / 1000) };
}

export interface QuotaState { limit: number; used: number; remaining: number; reset: number }

export function rateLimitHeaders(q: QuotaState): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(q.limit),
    "X-RateLimit-Remaining": String(Math.max(0, q.remaining)),
    "X-RateLimit-Reset": String(q.reset),
  };
}

/** Atomically consumes one scan through the service-role-only RPC. */
export async function consumeQuota(admin: SupabaseClient, keyId: string, limit: number): Promise<{ allowed: boolean; state: QuotaState }> {
  const { period, resetEpoch } = currentPeriod();
  const { data, error } = await admin.rpc("increment_api_usage", { p_key_id: keyId, p_period: period, p_limit: limit });
  if (error) throw new Error(`quota check failed: ${error.message}`);
  const count = Number(data);
  if (count === -1) return { allowed: false, state: { limit, used: limit, remaining: 0, reset: resetEpoch } };
  return { allowed: true, state: { limit, used: count, remaining: limit - count, reset: resetEpoch } };
}

export async function readQuota(admin: SupabaseClient, keyId: string, limit: number): Promise<QuotaState> {
  const { period, resetEpoch } = currentPeriod();
  const { data } = await admin.from("api_usage").select("count").eq("key_id", keyId).eq("period_month", period).maybeSingle();
  const used = Number(data?.count ?? 0);
  return { limit, used, remaining: limit - used, reset: resetEpoch };
}
