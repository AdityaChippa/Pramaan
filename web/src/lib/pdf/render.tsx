import "server-only";
import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseEvent, CaseRow } from "@/types/case";
import { ReportDocument } from "./ReportDocument";

async function fetchOverlay(client: SupabaseClient, path: string | null | undefined): Promise<Buffer | undefined> {
  if (!path) return undefined;
  const { data } = await client.storage.from("overlays").download(path);
  if (!data) return undefined;
  return Buffer.from(await data.arrayBuffer());
}

/** Loads a complete case with `client` (user-scoped, or admin after API-key auth) and renders the PDF. */
export async function buildCasePdf(client: SupabaseClient, caseId: string, siteUrl: string) {
  const { data } = await client.from("cases").select("*").eq("id", caseId).maybeSingle();
  const row = data as CaseRow | null;
  if (!row) return { error: "case not found", status: 404 } as const;
  if (row.status !== "complete") return { error: "case is not complete", status: 409 } as const;
  const { data: events } = await client.from("case_events").select("*").eq("case_id", caseId).order("id");
  const a = row.artifacts;
  const heatPath = a?.top_frames?.[0]?.overlay_path || a?.overlays?.find((o) => o.indicator_id === "face_cnn" || o.indicator_id === "univfd")?.path;
  const [thumbnail, heatmap] = await Promise.all([fetchOverlay(client, a?.thumbnail_path), fetchOverlay(client, heatPath)]);
  const verifyUrl = `${siteUrl.replace(/\/$/, "")}/verify${row.sha256 ? `?sha256=${row.sha256}` : ""}`;
  const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240 });
  const buffer = await renderToBuffer(
    <ReportDocument row={row} events={(events ?? []) as CaseEvent[]} images={{ thumbnail, heatmap, qr }} verifyUrl={verifyUrl} generatedAt={new Date().toISOString()} />,
  );
  return { buffer, row, sha256: createHash("sha256").update(buffer).digest("hex") } as const;
}
