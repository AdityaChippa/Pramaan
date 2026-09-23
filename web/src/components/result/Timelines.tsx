"use client";
import { SeriesChart } from "@/components/charts/SeriesChart";
import type { CaseArtifacts, Indicator } from "@/types/case";

function Missing({ ind, fallback }: { ind?: Indicator; fallback: string }) {
  return <p className="rounded-xl border border-hairline px-4 py-6 text-sm text-muted">{ind?.reason ?? fallback}</p>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="label-xs">{title}</p>
      {children}
    </div>
  );
}

export function Timelines({ artifacts, indicators, thresholds, onFrameClick }: {
  artifacts: CaseArtifacts;
  indicators: Indicator[];
  thresholds: { t_low: number; t_high: number } | null;
  onFrameClick: (t: number) => void;
}) {
  const s = artifacts.series ?? {};
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const rp = s.rppg;
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Block title="Per-frame manipulation score (face CNN)">
        {s.frame_scores?.length ? (
          <SeriesChart data={s.frame_scores.map((f) => ({ t: f.t, p: f.p }))} xKey="t" xLabel="seconds" yDomain={[0, 1]}
            series={[{ key: "p", label: "p(fake)", color: "#FF4D5E" }]} onPointClick={onFrameClick}
            refLines={thresholds ? [{ y: thresholds.t_high, label: "t_high" }, { y: thresholds.t_low, label: "t_low" }] : []} />
        ) : <Missing ind={byId.get("face_cnn")} fallback="Not analyzed — no video frames" />}
      </Block>
      <Block title="Per-window audio spoof score (AASIST-L)">
        {s.audio_spoof?.length ? (
          <SeriesChart data={s.audio_spoof} xKey="t" xLabel="seconds" yDomain={[0, 1]} series={[{ key: "p", label: "p(spoof)", color: "#F5A524" }]} />
        ) : <Missing ind={byId.get("aasist")} fallback="Not analyzed — no audio track" />}
      </Block>
      <Block title="Eye aspect ratio (blinks shaded)">
        {s.ear?.length ? (
          <SeriesChart data={s.ear} xKey="t" xLabel="seconds" series={[{ key: "ear", label: "EAR", color: "#D7E2EA" }]}
            refAreas={(s.blinks ?? []).map((b) => ({ x1: b.t_start, x2: b.t_end }))} />
        ) : <Missing ind={byId.get("blink")} fallback="Not analyzed — no tracked face" />}
      </Block>
      <Block title="Audio–visual sync (cross-correlation vs lag)">
        {s.av_sync ? (
          <SeriesChart data={s.av_sync.lags_ms.map((l, i) => ({ lag: l, r: s.av_sync!.corr[i] }))} xKey="lag" xLabel="lag (ms)"
            series={[{ key: "r", label: "r", color: "#7621B0" }]} refLines={[{ x: 0, label: "0 ms" }]} />
        ) : <Missing ind={byId.get("av_sync")} fallback="Not analyzed" />}
      </Block>
      <Block title="rPPG signals (forehead / cheeks)">
        {rp ? (
          <SeriesChart data={rp.t.map((t, i) => ({ t, forehead: rp.forehead[i], left: rp.left_cheek[i], right: rp.right_cheek[i] }))} xKey="t" xLabel="seconds"
            series={[{ key: "forehead", label: "forehead", color: "#FF4D5E" }, { key: "left", label: "left cheek", color: "#3DDC97" }, { key: "right", label: "right cheek", color: "#F5A524" }]} />
        ) : <Missing ind={byId.get("rppg")} fallback="Not analyzed" />}
      </Block>
      <Block title="rPPG pulse spectrum">
        {rp ? (
          <SeriesChart data={rp.freqs.map((f, i) => ({ bpm: Math.round(f * 600) / 10, power: rp.power[i] }))} xKey="bpm" xLabel="beats per minute"
            series={[{ key: "power", label: "power", color: "#D7E2EA" }]} />
        ) : <Missing ind={byId.get("rppg")} fallback="Not analyzed" />}
      </Block>
      {s.spectrum && (
        <Block title="Image radial power spectrum (log10)">
          <SeriesChart data={s.spectrum.freq.map((f, i) => ({ f, p: s.spectrum!.power[i] }))} xKey="f" xLabel="cycles / pixel"
            series={[{ key: "p", label: "log10 power", color: "#BE4C00" }]} />
        </Block>
      )}
    </div>
  );
}
