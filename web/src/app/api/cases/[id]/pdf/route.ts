import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildCasePdf } from "@/lib/pdf/render";
import { BUCKETS } from "@/lib/storage";
import { isUuid, jsonError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const out = await buildCasePdf(supabase, params.id, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  if ("error" in out) return jsonError(out.error ?? "failed", out.status ?? 500);
  // Keep a custody copy of every issued report.
  await createAdminSupabase().storage.from(BUCKETS.reports)
    .upload(`${user.id}/${params.id}/report-${Date.now()}.pdf`, out.buffer, { contentType: "application/pdf", upsert: false });
  return new Response(out.buffer, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="pramaan-${params.id}.pdf"`,
      "x-report-sha256": out.sha256,
      "cache-control": "no-store",
    },
  });
}
