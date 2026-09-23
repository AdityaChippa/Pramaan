/** SHA-256 in the browser (Web Crypto) and on the server (Node crypto). */
export async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isSha256(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s.trim());
}
