import { z } from "zod";
import { ACCEPT_MIME, PRESETS } from "@/config/indicators";

const allMime = Object.values(ACCEPT_MIME).flat();

export const mediaTypeSchema = z.enum(["image", "video", "audio"]);
export const presetSchema = z.enum(Object.keys(PRESETS) as [string, ...string[]]).nullable().optional();

export const createCaseSchema = z.object({
  filename: z.string().min(1).max(255),
  mime_type: z.string().refine((m) => allMime.includes(m.split(";")[0]), "unsupported media type"),
  file_size: z.number().int().positive(),
  media_type: mediaTypeSchema,
  source: z.enum(["upload", "record"]),
  client_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  duration_s: z.number().nonnegative().nullable().optional(),
  preset: presetSchema,
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const urlIngestSchema = z.object({
  url: z.string().url().max(2048),
  preset: presetSchema,
});

export const caseUpdateSchema = z
  .object({ is_shareable: z.boolean().optional(), is_public_showcase: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "nothing to update");

export const signSchema = z.object({ paths: z.array(z.string().min(3).max(512)).min(1).max(100) });

export const chatSchema = z.object({ message: z.string().trim().min(1).max(2000) });

export const verifySchema = z.object({ sha256: z.string().regex(/^[0-9a-fA-F]{64}$/) });

export const liveChunkSchema = z.object({
  session_id: z.string().uuid(),
  chunk_index: z.number().int().min(0).max(100000),
  t_start: z.number().nonnegative(),
  mime_type: z.enum(["video/webm", "audio/webm", "video/mp4"]),
});

export const liveAnalyzeSchema = z.object({
  session_id: z.string().uuid(),
  chunk_index: z.number().int().min(0),
  chunk_path: z.string().min(3).max(512),
  t_start: z.number().nonnegative(),
});

export const apiKeyCreateSchema = z.object({ name: z.string().trim().min(1).max(60) });

export function normalizeMime(m: string): string {
  return m.split(";")[0].trim().toLowerCase();
}
