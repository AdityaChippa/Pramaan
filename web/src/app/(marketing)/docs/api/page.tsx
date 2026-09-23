import type { Metadata } from "next";
import { CopyButton } from "@/components/ui/CopyButton";
import { SITE } from "@/config/site";

export const metadata: Metadata = { title: "API documentation" };

function Code({ code }: { code: string }) {
  return (
    <div className="relative">
      <div className="absolute right-3 top-3"><CopyButton text={code} /></div>
      <pre className="mono overflow-x-auto rounded-2xl border border-hairline bg-panel p-5 pr-14 text-xs leading-relaxed">{code}</pre>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-4 border-t border-hairline pt-10">
      <h2 className="text-3xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ApiDocsPage() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const curlUrl = `curl -X POST ${base}/api/v1/analyze \\
  -H "Authorization: Bearer $PRAMAAN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"media_url": "https://example.org/interview.mp4"}'`;
  const curlFile = `curl -X POST ${base}/api/v1/analyze \\
  -H "Authorization: Bearer $PRAMAAN_KEY" \\
  -F "file=@photo.jpg"`;
  const curlGet = `curl ${base}/api/v1/cases/$CASE_ID -H "Authorization: Bearer $PRAMAAN_KEY"
curl -o report.pdf ${base}/api/v1/cases/$CASE_ID/report.pdf -H "Authorization: Bearer $PRAMAAN_KEY"`;
  const js = `const BASE = "${base}";
const headers = { Authorization: \`Bearer \${process.env.PRAMAAN_KEY}\` };

const submit = await fetch(\`\${BASE}/api/v1/analyze\`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ media_url: "https://example.org/interview.mp4" }),
});
const { case_id } = await submit.json();
console.log("remaining this month:", submit.headers.get("X-RateLimit-Remaining"));

let result;
do {
  await new Promise((r) => setTimeout(r, 5000));
  result = await (await fetch(\`\${BASE}/api/v1/cases/\${case_id}\`, { headers })).json();
} while (result.status === "queued" || result.status === "processing");
console.log(result.verdict, result.probability, result.modality_contributions.groups);`;
  const py = `import os, time, requests

BASE = "${base}"
H = {"Authorization": f"Bearer {os.environ['PRAMAAN_KEY']}"}

with open("voice_note.wav", "rb") as f:  # multipart uploads are limited to 4 MB
    r = requests.post(f"{BASE}/api/v1/analyze", headers=H, files={"file": ("voice_note.wav", f, "audio/wav")})
r.raise_for_status()
case_id = r.json()["case_id"]

while True:
    case = requests.get(f"{BASE}/api/v1/cases/{case_id}", headers=H).json()
    if case["status"] in ("complete", "failed"):
        break
    time.sleep(5)

for ind in case["indicators"]:
    print(ind["id"], ind["status"], ind["value"], ind["unit"], ind["score_0_1"])`;
  const shape = `{
  "id": "uuid", "media_type": "video", "status": "complete",
  "sha256": "hex", "phash": "hex",
  "verdict": "authentic | inconclusive | manipulated",
  "probability": 0.0-1.0, "calibrated": true|false,
  "thresholds": { "t_low", "t_high", "target_fpr", "calibrated" },
  "modality_contributions": {
    "combo", "intercept", "logit",
    "groups": { "visual|temporal|audio|metadata": { "sum", "pct", "direction" } },
    "per_indicator": [{ "id", "group", "weight", "x", "mask", "contribution" }]
  },
  "indicators": [{ "id", "name", "group", "status", "reason", "value", "unit", "expected_range",
                   "score_0_1", "calibrated", "features", "details", "method", "reference", "evidence_artifact_url" }],
  "artifacts": { "thumbnail_path", "overlays": [...], "top_frames": [...], "series": {...} },
  "model_versions": { "face_cnn": "…", "aasist": "…" },
  "custody_log": [{ "step", "status", "started_at", "finished_at", "detail" }],
  "links": { "dashboard", "report_pdf", "verify" }
}`;
  return (
    <div className="mx-auto grid max-w-4xl gap-10 px-5 pb-24 pt-36">
      <header>
        <p className="label-xs">Developers</p>
        <h1 className="hero-heading text-5xl font-semibold md:text-7xl">{SITE.name} API</h1>
        <p className="mt-4 text-muted">REST over HTTPS. Create a key on the API Keys page; send it as a Bearer token. Keys are shown once and stored only as SHA-256 hashes.</p>
      </header>
      <Section id="auth" title="Authentication & quota">
        <p className="text-sm text-muted">Every request needs <code className="mono text-fog">Authorization: Bearer pk_…</code>. Each key has a monthly scan quota (default {process.env.API_FREE_MONTHLY_QUOTA ?? 50}); only <code className="mono">POST /api/v1/analyze</code> consumes it. Responses carry <code className="mono">X-RateLimit-Limit</code>, <code className="mono">X-RateLimit-Remaining</code> and <code className="mono">X-RateLimit-Reset</code> (Unix seconds, start of next UTC month). When exhausted the API returns <code className="mono">429</code> with <code className="mono">Retry-After</code>.</p>
      </Section>
      <Section id="analyze" title="POST /api/v1/analyze">
        <p className="text-sm text-muted">Body is either JSON <code className="mono">{"{ \"media_url\": \"https://…\" }"}</code> (fetched server-side, up to the platform upload limit) or <code className="mono">multipart/form-data</code> with field <code className="mono">file</code> (≤ 4 MB). Returns <code className="mono">202 {"{ case_id, status: \"queued\" }"}</code>. Analysis is asynchronous: poll the case.</p>
        <Code code={curlUrl} />
        <Code code={curlFile} />
      </Section>
      <Section id="cases" title="GET /api/v1/cases/{id} · GET /api/v1/cases/{id}/report.pdf">
        <p className="text-sm text-muted">Full explainable result for cases created by the key&apos;s owner. <code className="mono">status</code> moves queued → processing → complete | failed. The PDF endpoint returns the court-style report with an <code className="mono">x-report-sha256</code> header.</p>
        <Code code={curlGet} />
        <Code code={shape} />
      </Section>
      <Section id="js" title="JavaScript"><Code code={js} /></Section>
      <Section id="python" title="Python"><Code code={py} /></Section>
      <Section id="errors" title="Errors">
        <table className="mono w-full text-xs">
          <tbody>
            {[["400", "malformed body or id"], ["401", "missing, malformed or revoked key"], ["404", "case not found for this key's owner"], ["409", "case not complete (PDF)"], ["413", "multipart file over 4 MB"], ["415", "unsupported media type"], ["422", "media_url could not be fetched (private address, wrong content-type, too large)"], ["429", "monthly quota exhausted"], ["500", "server error"]].map(([c, d]) => (
              <tr key={c} className="border-b border-hairline"><td className="py-2 pr-6 text-fog">{c}</td><td className="text-muted">{d}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
