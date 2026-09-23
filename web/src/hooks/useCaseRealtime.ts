"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { CaseEvent, CaseRow } from "@/types/case";

/** Live case row + custody events over Supabase Realtime; a 5 s poll runs only if the channel fails. */
export function useCaseRealtime(caseId: string | null, initial?: { case: CaseRow | null; events: CaseEvent[] }) {
  const [row, setRow] = useState<CaseRow | null>(initial?.case ?? null);
  const [events, setEvents] = useState<CaseEvent[]>(initial?.events ?? []);
  const [channelState, setChannelState] = useState<"connecting" | "live" | "polling">("connecting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    const supabase = createBrowserSupabase();

    const load = async () => {
      const r = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
      if (!r.ok || cancelled) return;
      const j = (await r.json()) as { case: CaseRow; events: CaseEvent[] };
      setRow(j.case);
      setEvents(j.events);
    };

    const upsertEvent = (e: CaseEvent) =>
      setEvents((prev) => {
        const i = prev.findIndex((p) => p.id === e.id);
        if (i === -1) return [...prev, e].sort((a, b) => a.id - b.id);
        const next = prev.slice();
        next[i] = e;
        return next;
      });

    const channel = supabase
      .channel(`case-${caseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_events", filter: `case_id=eq.${caseId}` }, (p) => {
        if (p.new && "id" in p.new) upsertEvent(p.new as CaseEvent);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cases", filter: `id=eq.${caseId}` }, (p) => {
        setRow(p.new as CaseRow);
      })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setChannelState("live");
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          load();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setChannelState("polling");
          if (!pollRef.current) pollRef.current = setInterval(load, 5000);
        }
      });

    if (!initial?.case) load();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    if (row && (row.status === "complete" || row.status === "failed") && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [row]);

  return { row, events, channelState };
}
