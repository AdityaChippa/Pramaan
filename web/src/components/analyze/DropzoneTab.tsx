"use client";
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { ACCEPT_MIME, mediaTypeFromMime } from "@/config/indicators";
import type { MediaType } from "@/types/case";
import { cn } from "@/lib/utils";

export function DropzoneTab({ allowed, maxMb, onFile, onError }: { allowed: MediaType[]; maxMb: number; onFile: (f: File, t: MediaType) => void; onError: (m: string) => void }) {
  const accept: Record<string, string[]> = {};
  for (const t of allowed) for (const m of ACCEPT_MIME[t]) accept[m] = [];
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles: 1,
    maxSize: maxMb * 1024 * 1024,
    onDropAccepted: (files) => {
      const f = files[0];
      const t = mediaTypeFromMime(f.type);
      if (!t) return onError("Unsupported media type");
      onFile(f, t);
    },
    onDropRejected: (rej) => onError(rej[0]?.errors.map((e) => e.message).join("; ") ?? "File rejected"),
  });
  return (
    <div
      {...getRootProps()}
      className={cn(
        "grid-hairline flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-hairline p-10 text-center transition",
        isDragActive && "border-fog/60 bg-fog/5",
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className="text-muted" size={40} />
      <p className="text-lg">{isDragActive ? "Release to analyze" : "Drop an image, video or audio file"}</p>
      <p className="mono text-xs text-muted">
        {allowed.join(" · ")} · max {maxMb} MB
      </p>
    </div>
  );
}
