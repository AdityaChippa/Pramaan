export interface Confusion { tp: number; fp: number; tn: number; fn: number }

export function ConfusionMatrix({ c, caption }: { c: Confusion; caption?: string }) {
  const total = c.tp + c.fp + c.tn + c.fn || 1;
  const cell = (v: number, good: boolean) => (
    <div className="flex aspect-square flex-col items-center justify-center rounded-lg border border-hairline"
      style={{ background: `${good ? "#3DDC97" : "#FF4D5E"}${Math.round(20 + (v / total) * 120).toString(16).padStart(2, "0")}` }}>
      <span className="mono text-xl">{v}</span>
      <span className="mono text-[10px] text-muted">{((v / total) * 100).toFixed(1)}%</span>
    </div>
  );
  return (
    <figure className="grid gap-2">
      <div className="grid grid-cols-[70px_1fr_1fr] items-center gap-2 text-xs">
        <span />
        <span className="label-xs text-center">pred real</span>
        <span className="label-xs text-center">pred fake</span>
        <span className="label-xs">real</span>{cell(c.tn, true)}{cell(c.fp, false)}
        <span className="label-xs">fake</span>{cell(c.fn, false)}{cell(c.tp, true)}
      </div>
      {caption && <figcaption className="text-[11px] text-muted">{caption}</figcaption>}
    </figure>
  );
}
