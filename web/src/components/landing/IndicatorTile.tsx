import type { IndicatorCatalogRow } from "@/types/database";

/** Typographic taxonomy tile: names a real indicator and its method. Contains no results. */
export function IndicatorTile({ ind }: { ind: IndicatorCatalogRow }) {
  return (
    <div className="panel flex h-[260px] w-[340px] shrink-0 flex-col justify-between p-6">
      <div>
        <p className="label-xs">{ind.group} · {ind.modality}</p>
        <p className="mt-3 text-2xl font-medium leading-tight">{ind.name}</p>
      </div>
      <div>
        <p className="text-sm text-muted">{ind.method}</p>
        <p className="mono mt-3 truncate text-[10px] text-muted">{ind.reference}</p>
      </div>
    </div>
  );
}
