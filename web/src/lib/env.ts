import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "SUPABASE_SERVICE_ROLE_KEY is missing"),
  GROQ_API_KEY: z.string().min(10, "GROQ_API_KEY is missing"),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  ENGINE_URL: z.string().url({ message: "ENGINE_URL must be a URL (e.g. http://localhost:7860)" }),
  ENGINE_SHARED_SECRET: z.string().min(16, "ENGINE_SHARED_SECRET must be at least 16 characters"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
  API_FREE_MONTHLY_QUOTA: z.coerce.number().int().positive().default(50),
});

function formatIssues(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

let cachedPublic: z.infer<typeof publicSchema> | null = null;
/** Next inlines NEXT_PUBLIC_* only when referenced literally, so they are listed explicitly. */
export function publicEnv() {
  if (cachedPublic) return cachedPublic;
  const r = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!r.success) throw new Error(`[env] Invalid public environment: ${formatIssues(r.error)}`);
  cachedPublic = r.data;
  return r.data;
}

let cachedServer: z.infer<typeof serverSchema> | null = null;
export function serverEnv() {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  if (cachedServer) return cachedServer;
  const r = serverSchema.safeParse(process.env);
  if (!r.success) throw new Error(`[env] Invalid server environment: ${formatIssues(r.error)}`);
  cachedServer = r.data;
  return r.data;
}
