import { engineHealth } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await engineHealth();
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
