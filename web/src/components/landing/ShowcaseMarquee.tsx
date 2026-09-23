import { Marquee } from "@/components/ui/Marquee";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import type { IndicatorCatalogRow } from "@/types/database";
import type { Verdict } from "@/types/case";
import { IndicatorTile } from "./IndicatorTile";

export interface ShowcaseItem {
  case_id: string;
  media_type: string;
  verdict: Verdict | null;
  probability: number | null;
  calibrated: boolean;
  thumbnail_url: string | null;
  overlay_url: string | null;
}

function CaseTile({ item }: { item: ShowcaseItem }) {
  return (
    <div className="panel relative h-[260px] w-[340px] shrink-0 overflow-hidden">
      {item.thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      )}
      {item.overlay_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.overlay_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-screen" />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/90 to-transparent p-5">
        <div>
          <VerdictBadge verdict={item.verdict} />
          <p className="label-xs mt-2">{item.media_type}{item.calibrated ? "" : " · uncalibrated"}</p>
        </div>
        <p className="mono text-3xl">{item.probability === null ? "—" : `${(item.probability * 100).toFixed(1)}%`}</p>
      </div>
    </div>
  );
}

export function ShowcaseMarquee({ items, catalog }: { items: ShowcaseItem[]; catalog: IndicatorCatalogRow[] }) {
  const tiles: React.ReactNode[] = items.map((i) => <CaseTile key={i.case_id} item={i} />);
  if (tiles.length < 6) catalog.forEach((c) => tiles.push(<IndicatorTile key={c.id} ind={c} />));
  const half = Math.ceil(tiles.length / 2);
  return (
    <section aria-label={items.length ? "Public showcase cases" : "Forensic indicator taxonomy"} className="py-10">
      <Marquee rows={[tiles.slice(0, half), tiles.slice(half)]} />
    </section>
  );
}
