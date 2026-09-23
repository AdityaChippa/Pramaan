import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { SITE } from "@/config/site";
import { GROUP_LABELS, GROUP_ORDER, VERDICT_META } from "@/config/indicators";
import type { CaseEvent, CaseRow } from "@/types/case";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 3 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  mono: { fontFamily: "Courier", fontSize: 8 },
  muted: { color: "#666" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 3 },
  kv: { flexDirection: "row", marginBottom: 2 },
  k: { width: 110, color: "#555" },
  box: { borderWidth: 0.75, borderColor: "#999", padding: 8, marginTop: 8 },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, fontSize: 7, color: "#777", flexDirection: "row", justifyContent: "space-between" },
});

function n(v: number | null | undefined, d = 4) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v.toFixed(d)).toString();
}

export interface PdfImages { thumbnail?: Buffer; heatmap?: Buffer; qr: string }

export function ReportDocument({ row, events, images, verifyUrl, generatedAt }: { row: CaseRow; events: CaseEvent[]; images: PdfImages; verifyUrl: string; generatedAt: string }) {
  const verdict = row.verdict ? VERDICT_META[row.verdict] : null;
  const indicators = row.indicators ?? [];
  const summary = row.summary?.content as { headline?: string; summary?: string } | undefined;
  const report = row.report?.content as { overall_assessment?: string; limitations?: string[]; what_would_change_conclusion?: string[] } | undefined;
  const Footer = () => (
    <View style={s.footer} fixed>
      <Text>{SITE.name} forensic report · case {row.id}</Text>
      <Text render={({ pageNumber, totalPages }) => `page ${pageNumber} / ${totalPages}`} />
    </View>
  );
  return (
    <Document title={`${SITE.name} report ${row.id}`} author={SITE.name} subject="Synthetic media forensic analysis">
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={s.h1}>{SITE.name}</Text>
            <Text style={s.muted}>{SITE.tagline} · Forensic analysis report</Text>
            <Text style={[s.mono, { marginTop: 4 }]}>Generated {generatedAt}</Text>
          </View>
          <Image src={images.qr} style={{ width: 72, height: 72 }} />
        </View>

        <View style={[s.box, { borderColor: verdict?.color ?? "#999", borderWidth: 1.5 }]}>
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: verdict?.color ?? "#111" }}>
            VERDICT: {verdict ? verdict.label.toUpperCase() : "NONE"}
          </Text>
          <Text style={{ marginTop: 3 }}>
            Probability of manipulation {row.probability === null ? "—" : `${n(row.probability * 100, 2)}%`} · bands: authentic ≤ {n(row.thresholds?.t_low, 2)}, manipulated ≥ {n(row.thresholds?.t_high, 2)}
          </Text>
          <Text style={s.muted}>{row.calibrated ? "Calibrated fusion model." : "UNCALIBRATED DEFAULTS — fusion weights not yet trained; interpret with caution."}</Text>
        </View>

        <Text style={s.h2}>Evidence item</Text>
        {[
          ["Case ID", row.id], ["File name", row.filename ?? "—"], ["Media type", `${row.media_type} (${row.mime_type ?? "unknown"})`],
          ["Source", row.source], ["Size (bytes)", String(row.file_size ?? "—")], ["Duration (s)", n(row.duration_s, 2)],
          ["SHA-256", row.sha256 ?? "—"], ["pHash", row.phash ?? "—"], ["Received", row.created_at], ["Completed", row.completed_at ?? "—"],
          ["Model versions", Object.entries(row.model_versions ?? {}).filter(([, v]) => typeof v === "string").map(([k, v]) => `${k}@${v}`).join(", ") || "—"],
        ].map(([k, v]) => (
          <View key={k} style={s.kv}><Text style={s.k}>{k}</Text><Text style={k === "SHA-256" || k === "pHash" || k === "Case ID" ? s.mono : {}}>{v}</Text></View>
        ))}

        {(images.thumbnail || images.heatmap) && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {images.thumbnail && <View><Image src={images.thumbnail} style={{ height: 150, objectFit: "contain" }} /><Text style={s.muted}>Evidence preview</Text></View>}
            {images.heatmap && <View><Image src={images.heatmap} style={{ height: 150, objectFit: "contain" }} /><Text style={s.muted}>Most suspicious region / frame</Text></View>}
          </View>
        )}

        {summary?.summary && (
          <>
            <Text style={s.h2}>Executive summary</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{summary.headline}</Text>
            <Text style={{ marginTop: 3, lineHeight: 1.4 }}>{summary.summary}</Text>
            {row.summary?.grounding_warning && <Text style={s.muted}>Note: automated grounding check flagged unverified numbers in this summary.</Text>}
          </>
        )}

        <Text style={s.h2}>Modality contributions (log-odds)</Text>
        {row.modality_contributions ? GROUP_ORDER.map((g) => {
          const c = row.modality_contributions!.groups[g];
          return <View key={g} style={s.kv}><Text style={s.k}>{GROUP_LABELS[g]}</Text><Text style={s.mono}>{n(c.sum, 4)} ({n(c.pct, 1)}%, toward {c.direction})</Text></View>;
        }) : <Text>—</Text>}
        <Footer />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Forensic indicators</Text>
        <View style={[s.row, { fontFamily: "Helvetica-Bold" }]}>
          <Text style={{ width: "24%" }}>Indicator</Text><Text style={{ width: "16%" }}>Measured</Text><Text style={{ width: "22%" }}>Expected</Text>
          <Text style={{ width: "10%" }}>Score</Text><Text style={{ width: "28%" }}>Method / reference</Text>
        </View>
        {indicators.map((i) => (
          <View key={i.id} style={s.row} wrap={false}>
            <Text style={{ width: "24%" }}>{i.name}{i.status !== "ok" ? `\n[${i.status}] ${i.reason ?? ""}` : ""}</Text>
            <Text style={[s.mono, { width: "16%" }]}>{i.value === null ? "—" : `${n(i.value)} ${i.unit}`}</Text>
            <Text style={{ width: "22%" }}>{i.expected_range}</Text>
            <Text style={[s.mono, { width: "10%" }]}>{n(i.score_0_1, 3)}</Text>
            <Text style={{ width: "28%", fontSize: 7 }}>{i.method}{"\n"}{i.reference}</Text>
          </View>
        ))}
        {report?.overall_assessment && (
          <>
            <Text style={s.h2}>Technical assessment</Text>
            <Text style={{ lineHeight: 1.4 }}>{report.overall_assessment}</Text>
            {(report.limitations ?? []).length > 0 && <Text style={{ marginTop: 6, fontFamily: "Helvetica-Bold" }}>Limitations</Text>}
            {(report.limitations ?? []).map((l, k) => <Text key={k}>• {l}</Text>)}
            {(report.what_would_change_conclusion ?? []).length > 0 && <Text style={{ marginTop: 6, fontFamily: "Helvetica-Bold" }}>What would change the conclusion</Text>}
            {(report.what_would_change_conclusion ?? []).map((l, k) => <Text key={k}>• {l}</Text>)}
          </>
        )}
        <Footer />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Chain of custody</Text>
        {events.map((e, k) => (
          <View key={e.id} style={s.row} wrap={false}>
            <Text style={[s.mono, { width: "5%" }]}>{k + 1}</Text>
            <Text style={[s.mono, { width: "22%" }]}>{e.step}</Text>
            <Text style={[s.mono, { width: "10%" }]}>{e.status}</Text>
            <Text style={[s.mono, { width: "33%" }]}>{e.started_at}</Text>
            <Text style={[s.mono, { width: "30%" }]}>{e.finished_at ?? "—"}</Text>
          </View>
        ))}
        <View style={s.box}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Verification</Text>
          <Text>Scan the QR code or open the link below and paste the SHA-256 above. Verification succeeds only if the case owner marked it shareable.</Text>
          <Text style={s.mono}>{verifyUrl}</Text>
        </View>
        <View style={s.box}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Scope and limitations</Text>
          <Text>
            This report records automated detector outputs and measured forensic indicators. Scores are probabilistic evidence, not proof. Indicators marked
            not_applicable or error were not measured and do not contribute. Results should be corroborated by a qualified examiner.
          </Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
