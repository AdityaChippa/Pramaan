import { authenticateApiKey } from "@/lib/api-auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildCasePdf } from "@/lib/pdf/render";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  if (!isUuid(params.id)) return Response.json({ error: "invalid case id" }, { status: 400 });
  const admin = createAdminSupabase();
  const { data: owned } = await admin.from("cases").select("id").eq("id", params.id).eq("user_id", auth.principal.userId).maybeSingle();
  if (!owned) return Response.json({ error: "case not found" }, { status: 404 });
  const out = await buildCasePdf(admin, params.id, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  if ("error" in out) return Response.json({ error: out.error }, { status: out.status });
  return new Response(out.buffer, {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="pramaan-${params.id}.pdf"`, "x-report-sha256": out.sha256 },
  });
}
