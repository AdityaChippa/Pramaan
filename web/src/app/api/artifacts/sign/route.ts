import { requireUser } from "@/lib/supabase/server";
import { signSchema } from "@/lib/validators";
import { jsonError } from "@/lib/utils";

export const runtime = "nodejs";

/** Signs private overlay paths for the signed-in owner (Storage RLS limits reads to the user's prefix). */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = signSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid request", 400);
  const paths = Array.from(new Set(parsed.data.paths)).filter((p) => p.startsWith(`${user.id}/`) && !p.includes(".."));
  if (!paths.length) return Response.json({ urls: {} });
  const { data, error } = await supabase.storage.from("overlays").createSignedUrls(paths, 3600);
  if (error) return jsonError(error.message, 500);
  const urls: Record<string, string> = {};
  for (const d of data ?? []) if (d.signedUrl && d.path) urls[d.path] = d.signedUrl;
  return Response.json({ urls }, { headers: { "cache-control": "private, max-age=600" } });
}
