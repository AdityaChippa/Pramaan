"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { Panel } from "@/components/ui/Panel";
import { ContactButton } from "@/components/ui/ContactButton";
import { LiveProjectButton } from "@/components/ui/LiveProjectButton";
import { PRESETS } from "@/config/indicators";
import { useCaseRealtime } from "@/hooks/useCaseRealtime";
import { useAnalyzeStore } from "@/store/analyze-store";
import type { MediaType } from "@/types/case";
import { DropzoneTab } from "./DropzoneTab";
import { EngineStatus } from "./EngineStatus";
import { Preflight } from "./Preflight";
import { ProgressMachine } from "./ProgressMachine";
import { RecordTab } from "./RecordTab";
import { UrlTab } from "./UrlTab";
import { createCase, dispatchAnalysis, hashFile, mediaDuration, uploadWithProgress } from "./submit";

type Tab = "upload" | "record" | "url";

export function AnalyzeClient({ preset, maxMb }: { preset: string | null; maxMb: number }) {
  const router = useRouter();
  const presetMeta = preset ? PRESETS[preset] : undefined;
  const allowed: MediaType[] = presetMeta?.accept ?? ["image", "video", "audio"];
  const [tab, setTab] = useState<Tab>("upload");
  const s = useAnalyzeStore();
  const { row, events } = useCaseRealtime(s.caseId);

  useEffect(() => () => useAnalyzeStore.getState().reset(), []);

  useEffect(() => {
    if (!row || !s.caseId) return;
    if (row.status === "processing" && s.phase === "queued") s.setPhase("processing");
    if (row.status === "complete") {
      s.setPhase("complete");
      const t = setTimeout(() => router.push(`/cases/${row.id}`), 900);
      return () => clearTimeout(t);
    }
    if (row.status === "failed") s.fail(row.error ?? "Analysis failed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.status]);

  useEffect(() => {
    if (s.phase === "queued" && events.some((e) => e.step === "ingest")) s.setPhase("processing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  const onFile = async (file: File, mediaType: MediaType) => {
    const objectUrl = URL.createObjectURL(file);
    s.setMedia({ file, mediaType, source: tab === "record" ? "record" : "upload", objectUrl, durationS: null, sha256: null });
    const [duration, sha] = await Promise.all([
      mediaType === "image" ? Promise.resolve(null) : mediaDuration(objectUrl, mediaType),
      hashFile(file),
    ]);
    useAnalyzeStore.getState().patchMedia({ durationS: duration, sha256: sha });
  };

  const submit = async () => {
    const media = useAnalyzeStore.getState().media;
    if (!media) return;
    try {
      if (!media.sha256) {
        s.setPhase("hashing");
        const sha = await hashFile(media.file);
        s.patchMedia({ sha256: sha });
      }
      s.setPhase("uploading");
      const created = await createCase(useAnalyzeStore.getState().media!, preset);
      s.setCaseId(created.caseId);
      await uploadWithProgress(created.signedUrl, media.file, s.setUploadPct);
      s.setPhase("queued");
      await dispatchAnalysis(created.caseId);
    } catch (e) {
      s.fail(e instanceof Error ? e.message : "submission failed");
    }
  };

  const busy = ["hashing", "uploading", "queued", "processing", "complete"].includes(s.phase);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Analyze</p>
          <h1 className="text-4xl font-semibold md:text-5xl">Submit evidence</h1>
          {presetMeta && <p className="mt-2 max-w-2xl text-sm text-muted"><span className="text-fog">{presetMeta.label}:</span> {presetMeta.note}</p>}
        </div>
        <EngineStatus />
      </header>

      {!busy && s.phase !== "failed" && (
        <Panel
          title={s.media ? "Pre-flight" : "Input"}
          action={!s.media ? <Tabs<Tab> tabs={[{ id: "upload", label: "Upload" }, { id: "record", label: "Record" }, { id: "url", label: "URL" }]} value={tab} onChange={setTab} /> : undefined}
        >
          {!s.media && tab === "upload" && <DropzoneTab allowed={allowed} maxMb={maxMb} onFile={onFile} onError={s.fail} />}
          {!s.media && tab === "record" && <RecordTab onFile={onFile} onError={s.fail} />}
          {!s.media && tab === "url" && (
            <UrlTab preset={preset} onError={s.fail} onCase={(id) => { s.setCaseId(id); s.setPhase("queued"); }} />
          )}
          {s.media && (
            <div className="grid gap-6">
              <Preflight media={s.media} />
              <div className="flex flex-wrap gap-3">
                <ContactButton onClick={submit} disabled={!s.media.sha256}>Analyze Media</ContactButton>
                <LiveProjectButton onClick={s.reset}>Choose another file</LiveProjectButton>
              </div>
            </div>
          )}
        </Panel>
      )}

      {(busy || s.phase === "failed") && (
        <Panel title={s.caseId ? `Case ${s.caseId}` : "Submission"}>
          <ProgressMachine phase={s.phase} uploadPct={s.uploadPct} events={events} error={s.error} />
          {s.phase === "failed" && (
            <div className="mt-6 flex gap-3">
              <LiveProjectButton onClick={s.reset}>Start over</LiveProjectButton>
              {s.caseId && <LiveProjectButton href={`/cases/${s.caseId}`}>Open case record</LiveProjectButton>}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
