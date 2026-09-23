import { LiveProjectButton } from "@/components/ui/LiveProjectButton";

export function ApiTeaser({ siteUrl }: { siteUrl: string }) {
  const code = `curl -X POST ${siteUrl}/api/v1/analyze \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"media_url": "https://example.org/clip.mp4"}'

# → { "case_id": "…", "status": "queued" }
curl ${siteUrl}/api/v1/cases/<case_id> -H "Authorization: Bearer pk_your_key"`;
  return (
    <section className="mx-auto grid max-w-[1600px] gap-10 px-5 py-28 md:grid-cols-[1fr_1.4fr] md:px-10">
      <div>
        <h2 className="text-4xl font-semibold md:text-6xl">API-first</h2>
        <p className="mt-4 max-w-md text-muted">Per-user keys hashed at rest, monthly quotas with rate-limit headers, and the same explainable JSON the dashboard renders.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LiveProjectButton href="/keys">Get API key</LiveProjectButton>
          <LiveProjectButton href="/docs/api">Read the docs</LiveProjectButton>
        </div>
      </div>
      <pre className="mono overflow-x-auto rounded-2xl border border-hairline bg-panel p-6 text-xs leading-relaxed text-fog/90">{code}</pre>
    </section>
  );
}
