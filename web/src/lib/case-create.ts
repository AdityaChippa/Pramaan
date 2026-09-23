import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { mediaPath, BUCKETS, signedUploadUrl } from "@/lib/storage";
import type { CaseSource, MediaType } from "@/types/case";

export interface NewCase {
  userId: string;
  mediaType: MediaType;
  source: CaseSource;
  filename: string;
  mimeType: string;
  fileSize: number;
  clientSha256?: string | null;
  durationS?: number | null;
  preset?: string | null;
  parentCaseId?: string | null;
  apiKeyId?: string | null;
  filePath?: string;
}

/** Creates a queued case row (service role, after the caller has authenticated the user or API key). */
export async function insertCase(c: NewCase): Promise<{ id: string; file_path: string }> {
  const admin = createAdminSupabase();
  const id = crypto.randomUUID();
  const filePath = c.filePath ?? mediaPath(c.userId, id, c.filename);
  const { error } = await admin.from("cases").insert({
    id,
    user_id: c.userId,
    media_type: c.mediaType,
    source: c.source,
    filename: c.filename.slice(0, 255),
    mime_type: c.mimeType,
    preset: c.preset ?? null,
    file_path: filePath,
    client_sha256: c.clientSha256 ?? null,
    file_size: c.fileSize,
    duration_s: c.durationS ?? null,
    parent_case_id: c.parentCaseId ?? null,
    api_key_id: c.apiKeyId ?? null,
    status: "queued",
  });
  if (error) throw new Error(`case insert failed: ${error.message}`);
  return { id, file_path: filePath };
}

export async function createCaseWithUpload(c: NewCase) {
  const row = await insertCase(c);
  const upload = await signedUploadUrl(createAdminSupabase(), BUCKETS.media, row.file_path);
  return { caseId: row.id, filePath: row.file_path, signedUrl: upload.signedUrl, token: upload.token };
}

/** Stores server-fetched bytes (URL ingest, public API multipart) and creates the case. */
export async function createCaseFromBytes(c: NewCase, bytes: ArrayBuffer) {
  const admin = createAdminSupabase();
  const id = crypto.randomUUID();
  const filePath = mediaPath(c.userId, id, c.filename);
  const { error: upErr } = await admin.storage.from(BUCKETS.media).upload(filePath, bytes, { contentType: c.mimeType, upsert: false });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
  const { error } = await admin.from("cases").insert({
    id,
    user_id: c.userId,
    media_type: c.mediaType,
    source: c.source,
    filename: c.filename.slice(0, 255),
    mime_type: c.mimeType,
    preset: c.preset ?? null,
    file_path: filePath,
    client_sha256: c.clientSha256 ?? null,
    file_size: c.fileSize,
    api_key_id: c.apiKeyId ?? null,
    status: "queued",
  });
  if (error) {
    await admin.storage.from(BUCKETS.media).remove([filePath]);
    throw new Error(`case insert failed: ${error.message}`);
  }
  return { caseId: id, filePath };
}
