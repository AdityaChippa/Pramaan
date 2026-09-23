import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeFilename } from "@/lib/utils";

export const BUCKETS = {
  media: "media-uploads",
  overlays: "overlays",
  live: "live-chunks",
  reports: "reports",
} as const;

export function mediaPath(userId: string, caseId: string, filename: string): string {
  return `${userId}/${caseId}/${sanitizeFilename(filename)}`;
}

export async function signedUploadUrl(admin: SupabaseClient, bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error(`could not create signed upload URL: ${error?.message ?? "unknown"}`);
  return data; // { signedUrl, token, path }
}

export async function objectExists(admin: SupabaseClient, bucket: string, path: string): Promise<boolean> {
  const dir = path.split("/").slice(0, -1).join("/");
  const name = path.split("/").pop() ?? "";
  const { data, error } = await admin.storage.from(bucket).list(dir, { search: name, limit: 10 });
  if (error) return false;
  return (data ?? []).some((o) => o.name === name);
}

export async function removePrefix(admin: SupabaseClient, bucket: string, prefix: string): Promise<number> {
  const removed: string[] = [];
  const walk = async (p: string, depth: number) => {
    const { data } = await admin.storage.from(bucket).list(p, { limit: 1000 });
    for (const o of data ?? []) {
      const full = `${p}/${o.name}`;
      if (o.id === null && depth < 4) await walk(full, depth + 1);
      else removed.push(full);
    }
  };
  await walk(prefix, 0);
  for (let i = 0; i < removed.length; i += 100) await admin.storage.from(bucket).remove(removed.slice(i, i + 100));
  return removed.length;
}
