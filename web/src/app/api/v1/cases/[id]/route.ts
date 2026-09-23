import { authenticateApiKey } from "@/lib/api-auth";
import { rateLimitHeaders, readQuota } from "@/lib/quota";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  if (!isUuid(params.id)) return Response.json({ error: "invalid case id" }, { status: 400 });
  const admin = createAdminSupabase();
  const headers = rateLimitHeaders(await readQuota(admin, auth.principal.keyId, auth.principal.limit));
  const { data } = await admin
    .from("cases")
    .select("id,media_type,source,filename,mime_type,sha256,phash,file_size,duration_s,status,error,verdict,probability,calibrated,thresholds,modality_contributions,indicators,artifacts,model_versions,created_at,completed_at")
    .eq("id", params.id).eq("user_id", auth.principal.userId).maybeSingle();
  if (!data) return Response.json({ error: "case not found" }, { status: 404, headers });
  const { data: events } = await admin.from("case_events").select("step,status,started_at,finished_at,detail").eq("case_id", params.id).order("id");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return Response.json({
    ...data,
    custody_log: events ?? [],
    links: {
      dashboard: `${site}/cases/${data.id}`,
      report_pdf: `${site}/api/v1/cases/${data.id}/report.pdf`,
      verify: data.sha256 ? `${site}/verify?sha256=${data.sha256}` : null,
    },
  }, { headers });
}
