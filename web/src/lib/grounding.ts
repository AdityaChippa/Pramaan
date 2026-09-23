/**
 * Post-generation grounding check: every number in the LLM output must exist in the case JSON
 * (rounding tolerance; probabilities may be restated as percentages).
 * Exempt: integers 0–3 (ordinal/"two faces"), hex hashes and UUIDs, ISO timestamps (checked as strings).
 */
const HEXLIKE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{16,64}\b/gi;
const ISO = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2}| UTC)?/g;
const NUM = /(?<![\w.])[-−]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?(?![\w])/gi;

function numbersInText(s: string): number[] {
  const cleaned = s.replace(HEXLIKE, " ").replace(ISO, " ");
  return (cleaned.match(NUM) ?? []).map((m) => Number(m.replace("−", "-").replace(",", "."))).filter(Number.isFinite);
}

function collect(v: unknown, out: number[], strings: string[]) {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (typeof v === "string") {
    strings.push(v);
    out.push(...numbersInText(v));
  } else if (Array.isArray(v)) v.forEach((x) => collect(x, out, strings));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, out, strings));
}

function decimals(n: number): number {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function supported(n: number, pool: number[]): boolean {
  if (Number.isInteger(n) && Math.abs(n) <= 3) return true;
  const d = decimals(n);
  const tol = Math.max(0.5 * Math.pow(10, -d), Math.abs(n) * 0.005);
  for (const x of pool) {
    for (const cand of [x, x * 100, Math.abs(x), Math.abs(x) * 100, x * 60]) {
      if (Math.abs(cand - n) <= tol || Math.abs(Math.abs(cand) - Math.abs(n)) <= tol) return true;
    }
  }
  return false;
}

export function textOf(output: unknown): string {
  const strings: string[] = [];
  collect(output, [], strings);
  return strings.join("\n");
}

export function checkGrounding(output: unknown, input: unknown): { ok: boolean; unsupported: number[] } {
  const pool: number[] = [];
  collect(input, pool, []);
  const found = numbersInText(textOf(output));
  const unsupported = Array.from(new Set(found.filter((n) => !supported(n, pool))));
  return { ok: unsupported.length === 0, unsupported };
}
