import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { BUCKETS, removePrefix } from "@/lib/storage";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** "Delete my data": storage objects under the user's prefix in every bucket, then the auth user (rows cascade). */
export async function DELETE() {
  const { user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const admin = createAdminSupabase();
  const removed: Record<string, number> = {};
  try {
    for (const bucket of Object.values(BUCKETS)) removed[bucket] = await removePrefix(admin, bucket, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return jsonError(`storage cleared but account deletion failed: ${error.message}`, 500, { removed });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "deletion failed", 500, { removed });
  }
  return Response.json({ deleted: true, removed });
}
