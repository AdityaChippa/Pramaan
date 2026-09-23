import { create } from "zustand";
import type { LiveWindowScores } from "@/types/database";

export interface LiveWindow {
  index: number;
  t: number;
  scores: LiveWindowScores | null;
  error: string | null;
  latencyMs: number | null;
}

interface LiveState {
  sessionId: string | null;
  running: boolean;
  startedAt: number | null;
  windows: LiveWindow[];
  pending: number;
  dropped: number;
  finalCaseId: string | null;
  error: string | null;
  start: (sessionId: string) => void;
  stop: () => void;
  addPending: () => void;
  resolveWindow: (w: LiveWindow) => void;
  drop: () => void;
  setFinal: (caseId: string) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  sessionId: null,
  running: false,
  startedAt: null,
  windows: [],
  pending: 0,
  dropped: 0,
  finalCaseId: null,
  error: null,
  start: (sessionId) => set({ sessionId, running: true, startedAt: Date.now(), windows: [], pending: 0, dropped: 0, finalCaseId: null, error: null }),
  stop: () => set({ running: false }),
  addPending: () => set((s) => ({ pending: s.pending + 1 })),
  resolveWindow: (w) => set((s) => ({ pending: Math.max(0, s.pending - 1), windows: [...s.windows, w].sort((a, b) => a.index - b.index) })),
  drop: () => set((s) => ({ dropped: s.dropped + 1 })),
  setFinal: (finalCaseId) => set({ finalCaseId }),
  setError: (error) => set({ error }),
  reset: () => set({ sessionId: null, running: false, startedAt: null, windows: [], pending: 0, dropped: 0, finalCaseId: null, error: null }),
}));
