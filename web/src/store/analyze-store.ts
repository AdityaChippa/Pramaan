import { create } from "zustand";
import type { MediaType } from "@/types/case";

export type Phase = "idle" | "ready" | "hashing" | "uploading" | "queued" | "processing" | "complete" | "failed";

export interface SelectedMedia {
  file: File;
  mediaType: MediaType;
  source: "upload" | "record";
  objectUrl: string;
  durationS: number | null;
  sha256: string | null;
}

interface AnalyzeState {
  phase: Phase;
  media: SelectedMedia | null;
  uploadPct: number;
  caseId: string | null;
  error: string | null;
  setMedia: (m: SelectedMedia | null) => void;
  patchMedia: (p: Partial<SelectedMedia>) => void;
  setPhase: (p: Phase) => void;
  setUploadPct: (n: number) => void;
  setCaseId: (id: string | null) => void;
  fail: (msg: string) => void;
  reset: () => void;
}

export const useAnalyzeStore = create<AnalyzeState>((set, get) => ({
  phase: "idle",
  media: null,
  uploadPct: 0,
  caseId: null,
  error: null,
  setMedia: (m) => {
    const prev = get().media;
    if (prev && prev.objectUrl !== m?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
    set({ media: m, phase: m ? "ready" : "idle", error: null, uploadPct: 0, caseId: null });
  },
  patchMedia: (p) => set((s) => (s.media ? { media: { ...s.media, ...p } } : {})),
  setPhase: (phase) => set({ phase }),
  setUploadPct: (uploadPct) => set({ uploadPct }),
  setCaseId: (caseId) => set({ caseId }),
  fail: (error) => set({ phase: "failed", error }),
  reset: () => {
    const prev = get().media;
    if (prev) URL.revokeObjectURL(prev.objectUrl);
    set({ phase: "idle", media: null, uploadPct: 0, caseId: null, error: null });
  },
}));
