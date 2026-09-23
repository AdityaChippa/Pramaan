import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

function ipv6Private(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::" || x === "::1") return true;
  if (x.startsWith("::ffff:")) return ipv4Private(x.slice(7));
  return x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
}

export function isPrivateAddress(ip: string): boolean {
  return net.isIPv4(ip) ? ipv4Private(ip) : net.isIPv6(ip) ? ipv6Private(ip) : true;
}

/** Validates scheme/port and that every resolved address is public. Returns the URL for fetching. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("only http(s) URLs are allowed");
  if (u.username || u.password) throw new Error("credentials in URLs are not allowed");
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new Error("port not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("host not allowed");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("URL resolves to a private or reserved address");
  return u;
}

/** Fetches with manual redirect handling (each hop re-validated) and a hard byte cap. */
export async function fetchPublicMedia(raw: string, maxBytes: number, allowedMime: string[]) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "PRAMAAN-ingest/1.0" } });
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect without location");
      url = await assertPublicUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`remote server responded ${res.status}`);
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!allowedMime.includes(mime)) throw new Error(`content-type ${mime || "(none)"} is not a supported media type`);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new Error(`file larger than ${Math.round(maxBytes / 1048576)} MB`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`file larger than ${Math.round(maxBytes / 1048576)} MB`);
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    const name = decodeURIComponent(url.pathname.split("/").pop() || "remote-media");
    return { bytes: out.buffer, mime, filename: name, finalUrl: url.toString() };
  }
  throw new Error("too many redirects");
}
