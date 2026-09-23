import { authenticateApiKey } from "@/lib/api-auth";
import { consumeQuota, rateLimitHeaders } from "@/lib/quota";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createCaseFromBytes } from "@/lib/case-create";
import { engineAnalyze } from "@/lib/engine";
import { fetchPublicMedia } from "@/lib/ssrf";
import { serverEnv } from "@/lib/env";
import { sha256Hex } from "@/lib/hashing";
import { ACCEPT_MIME, mediaTypeFromMime } from "@/config/indicators";
import { normalizeMime, urlIngestSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 60;

const MULTIPART_MAX = 4 * 1024 * 1024; // Vercel request body limit; larger files: use media_url

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { principal } = auth;
  const admin = createAdminSupabase();

  let bytes: ArrayBuffer;
  let mime: string;
  let filename: string;
  let clientSha: string | null = null;
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.startsWith("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > MULTIPART_MAX + 64 * 1024) {
        return Response.json({ error: "multipart uploads are limited to 4 MB; send { media_url } for larger files" }, { status: 413 });
      }
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "form field 'file' is required" }, { status: 400 });
      if (file.size > MULTIPART_MAX) return Response.json({ error: "multipart uploads are limited to 4 MB" }, { status: 413 });
      bytes = await file.arrayBuffer();
      mime = normalizeMime(file.type);
      filename = file.name || "upload";
      clientSha = await sha256Hex(bytes);
    } else {
      const parsed = urlIngestSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "send multipart 'file' or JSON { media_url }" }, { status: 400 });
      const media = await fetchPublicMedia(parsed.data.url, serverEnv().MAX_UPLOAD_MB * 1024 * 1024, Object.values(ACCEPT_MIME).flat());
      bytes = media.bytes;
      mime = media.mime;
      filename = media.filename;
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not read media" }, { status: 422 });
  }
  const mediaType = mediaTypeFromMime(mime);
  if (!mediaType || !Object.values(ACCEPT_MIME).flat().includes(mime)) return Response.json({ error: `unsupported media type ${mime}` }, { status: 415 });

  const quota = await consumeQuota(admin, principal.keyId, principal.limit);
  const headers = rateLimitHeaders(quota.state);
  if (!quota.allowed) return Response.json({ error: "monthly quota exhausted" }, { status: 429, headers: { ...headers, "Retry-After": String(quota.state.reset - Math.floor(Date.now() / 1000)) } });

  try {
    const { caseId } = await createCaseFromBytes(
      { userId: principal.userId, mediaType, source: "api", filename, mimeType: mime, fileSize: bytes.byteLength, clientSha256: clientSha, apiKeyId: principal.keyId },
      bytes,
    );
    const r = await engineAnalyze(caseId);
    return Response.json({ case_id: caseId, status: "queued", dispatched: r.ok }, { status: 202, headers });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "case creation failed" }, { status: 500, headers });
  }
}
