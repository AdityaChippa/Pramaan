import "server-only";
import Groq from "groq-sdk";
import { serverEnv } from "@/lib/env";

let client: Groq | null = null;

export function groq(): Groq {
  if (!client) client = new Groq({ apiKey: serverEnv().GROQ_API_KEY });
  return client;
}

export function groqModel(): string {
  return serverEnv().GROQ_MODEL;
}

export const GROUNDING_RULES = `You are a forensic analyst assistant for PRAMAAN, an explainable synthetic-media detection system.
You receive ONE JSON object: the stored evidence of a single case (indicators with measured values, fusion contributions, verdict, thresholds, custody log).
Rules:
- Use ONLY facts present in that JSON. Never introduce any number, statistic, accuracy figure, date or name that is not in it.
- When you cite a number, copy it exactly as it appears (you may express a probability as a percentage).
- Indicators with status "not_applicable" or "error" were not measured: say so, never guess their result.
- If "calibrated" is false, state that scores come from uncalibrated default weights.
- A forensic tool never proves authenticity with certainty; describe evidence strength, not guilt.
- Respond with a single JSON object only.`;

export async function groqJson<T>(system: string, user: string, maxTokens = 2500): Promise<T> {
  const r = await groq().chat.completions.create({
    model: groqModel(),
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const text = r.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as T;
}

export function groqErrorMessage(e: unknown): { status: number; message: string } {
  const status = typeof e === "object" && e && "status" in e ? Number((e as { status: number }).status) : 500;
  if (status === 429) return { status, message: "Groq rate limit reached — wait a moment and retry" };
  return { status: status >= 400 && status < 600 ? status : 500, message: e instanceof Error ? e.message : "Groq request failed" };
}
