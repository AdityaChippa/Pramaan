import { create } from "zustand";
import type { MediaType, Verdict } from "@/types/case";

export interface ArchiveFiltersState {
  verdict: Verdict | "all";
  media: MediaType | "all";
  from: string;
  to: string;
  q: string;
}

interface ArchiveState {
  filters: ArchiveFiltersState;
  view: "dome" | "grid";
  mode: "sphere" | "cluster";
  selected: string | null;
  setFilter: <K extends keyof ArchiveFiltersState>(k: K, v: ArchiveFiltersState[K]) => void;
  resetFilters: () => void;
  setView: (v: "dome" | "grid") => void;
  setMode: (m: "sphere" | "cluster") => void;
  select: (id: string | null) => void;
}

const DEFAULTS: ArchiveFiltersState = { verdict: "all", media: "all", from: "", to: "", q: "" };

export const useArchiveStore = create<ArchiveState>((set) => ({
  filters: DEFAULTS,
  view: "dome",
  mode: "sphere",
  selected: null,
  setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
  resetFilters: () => set({ filters: DEFAULTS }),
  setView: (view) => set({ view }),
  setMode: (mode) => set({ mode }),
  select: (selected) => set({ selected }),
}));
