import { sha256Hex } from "@/lib/hashing";
import type { SelectedMedia } from "@/store/analyze-store";

export async function hashFile(file: File): Promise<string> {
  return sha256Hex(file);
}

export async function createCase(media: SelectedMedia, preset: string | null) {
  const r = await fetch("/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: media.file.name,
      mime_type: media.file.type,
      file_size: media.file.size,
      media_type: media.mediaType,
      source: media.source,
      client_sha256: media.sha256,
      duration_s: media.durationS,
      preset,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `case creation failed (${r.status})`);
  return j as { caseId: string; filePath: string; signedUrl: string; token: string };
}

/** PUT to the Supabase signed upload URL with real progress events (same multipart shape as storage-js). */
export function uploadWithProgress(signedUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`)));
    xhr.onerror = () => reject(new Error("network error during upload"));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

export async function dispatchAnalysis(caseId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = await fetch(`/api/cases/${caseId}/analyze`, { method: "POST" });
    if (r.ok) return;
    const j = await r.json().catch(() => ({}));
    if (r.status !== 503) throw new Error(j.error ?? `dispatch failed (${r.status})`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error("engine did not accept the job — try again when it is awake");
}

export function mediaDuration(url: string, kind: "video" | "audio"): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      if (Number.isFinite(d)) return resolve(d);
      // MediaRecorder WebM reports Infinity until seeked to the end.
      el.currentTime = 1e9;
      el.ontimeupdate = () => {
        el.ontimeupdate = null;
        resolve(Number.isFinite(el.duration) ? el.duration : null);
      };
    };
    el.onerror = () => resolve(null);
    el.src = url;
  });
}
