import { requireUser } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildCaseJson } from "@/lib/case-json";
import { checkGrounding } from "@/lib/grounding";
import { GROUNDING_RULES, groq, groqErrorMessage, groqJson, groqModel } from "@/lib/groq";
import { chatSchema } from "@/lib/validators";
import { isUuid, jsonError } from "@/lib/utils";
import type { CaseEvent, CaseRow } from "@/types/case";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `${GROUNDING_RULES}
Task: answer the investigator's question about THIS case only.
If the question cannot be answered from the evidence JSON (other cases, general news, legal advice, identity of people), set "in_scope" false and politely explain that you can only discuss this case's evidence.
JSON schema: {"answer": string, "in_scope": boolean, "cited_indicators": [string]}`;

/** Extracts the (possibly incomplete) value of the "answer" string from a partial JSON stream. */
function partialAnswer(buf: string): string {
  const m = /"answer"\s*:\s*"/.exec(buf);
  if (!m) return "";
  let out = "";
  for (let i = m.index + m[0].length; i < buf.length; i++) {
    const c = buf[i];
    if (c === "\\") {
      const n = buf[i + 1];
      if (n === undefined) break;
      if (n === "u") {
        const hex = buf.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 5;
      } else {
        out += ({ n: "\n", t: "\t", r: "", '"': '"', "\\": "\\", "/": "/" } as Record<string, string>)[n] ?? n;
        i += 1;
      }
    } else if (c === '"') break;
    else out += c;
  }
  return out;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return jsonError("invalid case id", 400);
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("not signed in", 401);
  const parsed = chatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid message", 400);
  const { data } = await supabase.from("cases").select("*").eq("id", params.id).maybeSingle();
  const row = data as CaseRow | null;
  if (!row) return jsonError("case not found", 404);
  if (row.status !== "complete") return jsonError("case is not complete", 409);

  const [{ data: events }, { data: history }] = await Promise.all([
    supabase.from("case_events").select("*").eq("case_id", params.id).order("id"),
    supabase.from("chat_messages").select("role,content").eq("case_id", params.id).order("id", { ascending: false }).limit(12),
  ]);
  const { error: insErr } = await supabase.from("chat_messages").insert({ case_id: params.id, user_id: user.id, role: "user", content: parsed.data.message });
  if (insErr) return jsonError(insErr.message, 500);

  const input = buildCaseJson(row, (events ?? []) as CaseEvent[]);
  const messages = [
    { role: "system" as const, content: `${SYSTEM}\nCase evidence JSON:\n${JSON.stringify(input)}` },
    ...(history ?? []).reverse().map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: parsed.data.message },
  ];
  const admin = createAdminSupabase();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      let raw = "";
      let sent = "";
      try {
        try {
          const completion = await groq().chat.completions.create({
            model: groqModel(), temperature: 0.2, max_tokens: 900, stream: true, response_format: { type: "json_object" }, messages,
          });
          for await (const chunk of completion) {
            raw += chunk.choices[0]?.delta?.content ?? "";
            const ans = partialAnswer(raw);
            if (ans.length > sent.length) {
              send({ type: "delta", text: ans.slice(sent.length) });
              sent = ans;
            }
          }
        } catch (streamErr) {
          const g = groqErrorMessage(streamErr);
          if (g.status === 429) throw streamErr;
          // JSON mode + streaming may be rejected by the provider: fall back to a single JSON completion.
          const res = await groqJson<{ answer?: string }>(messages[0].content, messages.slice(1).map((m) => `${m.role}: ${m.content}`).join("\n"), 900);
          raw = JSON.stringify(res);
        }
        let answer: { answer?: string; in_scope?: boolean; cited_indicators?: string[] } = {};
        try { answer = JSON.parse(raw); } catch { answer = { answer: partialAnswer(raw) }; }
        let check = checkGrounding({ answer: answer.answer ?? "" }, input);
        if (!check.ok) {
          const retry = await groqJson<typeof answer>(
            `${messages[0].content}\nA previous draft used numbers not in the evidence (${check.unsupported.join(", ")}). Answer again using only numbers present in the JSON.`,
            messages.slice(1).map((m) => `${m.role}: ${m.content}`).join("\n"), 900);
          const retryCheck = checkGrounding({ answer: retry.answer ?? "" }, input);
          answer = retry;
          check = retryCheck;
          send({ type: "replace", text: answer.answer ?? "" });
        } else if ((answer.answer ?? "") !== sent) {
          send({ type: "replace", text: answer.answer ?? "" });
        }
        const text = answer.answer ?? "";
        await admin.from("chat_messages").insert({ case_id: params.id, user_id: user.id, role: "assistant", content: text, grounding_warning: !check.ok });
        send({ type: "done", grounding_warning: !check.ok, unsupported_numbers: check.unsupported, in_scope: answer.in_scope ?? true, cited_indicators: answer.cited_indicators ?? [] });
      } catch (e) {
        send({ type: "error", message: groqErrorMessage(e).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
