"use client";
import { bytes, seconds, shortHash } from "@/lib/format";
import type { SelectedMedia } from "@/store/analyze-store";
import { CopyButton } from "@/components/ui/CopyButton";

export function Preflight({ media }: { media: SelectedMedia }) {
  return (
    <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
      <div className="overflow-hidden rounded-2xl border border-hairline bg-black">
        {media.mediaType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.objectUrl} alt="Selected media preview" className="max-h-[420px] w-full object-contain" />
        )}
        {media.mediaType === "video" && <video src={media.objectUrl} controls className="max-h-[420px] w-full" />}
        {media.mediaType === "audio" && (
          <div className="flex h-[200px] items-center justify-center p-6">
            <audio src={media.objectUrl} controls className="w-full" />
          </div>
        )}
      </div>
      <dl className="grid content-start gap-3 text-sm">
        {[
          ["File", media.file.name],
          ["Type", `${media.mediaType} · ${media.file.type || "unknown"}`],
          ["Size", bytes(media.file.size)],
          ["Duration", media.mediaType === "image" ? "—" : seconds(media.durationS)],
          ["Source", media.source],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-hairline pb-2">
            <dt className="label-xs">{k}</dt>
            <dd className="mono truncate text-right">{v}</dd>
          </div>
        ))}
        <div className="border-b border-hairline pb-2">
          <dt className="label-xs mb-1 flex items-center justify-between">SHA-256 (computed in your browser){media.sha256 && <CopyButton text={media.sha256} />}</dt>
          <dd className="mono break-all text-xs">{media.sha256 ?? "computing…"}</dd>
        </div>
        {media.sha256 && <p className="mono text-[11px] text-muted">Engine re-computes this hash at ingestion; a mismatch fails the case. {shortHash(media.sha256, 8)}</p>}
      </dl>
    </div>
  );
}
