import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Format: pk_<43 base64url chars>. Only the SHA-256 and a 12-character display prefix are stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `pk_${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function looksLikeApiKey(s: string): boolean {
  return /^pk_[A-Za-z0-9_-]{40,60}$/.test(s);
}
