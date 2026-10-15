import { useMemo, useState } from "react";
import type { YardMap, YardSlot } from "../services/api";

const STACK_LIMIT = 5;

type Props = {
  yardMap?: YardMap | null;
  currentWindKmh?: number;
};

type StackPos = {
  bay: string;
  row: string;
  containers: YardSlot[]; // sorted by tier asc (bottom → top)
  stackHeight: number;
  maxRisk: number;
  riskLevel: string;
  heightGap: number;
  hasImdg: boolean;
};

type BlockModel = {
  block: string;
  containers: YardSlot[];
  bays: string[];
  bayCols: BayCol[];
  rows: string[];
  stacks: Map<string, StackPos>;
  ctrCount: number;
  stackCount: number;
  highCount: number;
  gapCount: number;
};

function riskColor(level: string, score: number) {
  if (level === "High" || score >= 70) return "#dc2626";
  if (level === "Medium" || score >= 40) return "#ea580c";
  return "#16a34a";
}

function sortBays(bays: string[]) {
  return [...bays].sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb || a.localeCompare(b);
  });
}

function sortRows(rows: string[]) {
  return [...rows].sort((a, b) => a.localeCompare(b));
}

function bayNum(v: string) {
  return parseInt(String(v).replace(/\D/g, ""), 10) || 0;
}

/** Occupied bays plus a gap marker when TOS bays are not consecutive. */
type BayCol = { type: "bay"; bay: string } | { type: "gap"; key: string };

function bayColumns(bays: string[]): BayCol[] {
  const sorted = sortBays(bays);
  const out: BayCol[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && bayNum(sorted[i]) - bayNum(sorted[i - 1]) > 4) {
      out.push({ type: "gap", key: `gap-${sorted[i - 1]}-${sorted[i]}` });
    }
    out.push({ type: "bay", bay: sorted[i] });
  }
  return out;
}

function buildBlocks(slots: YardSlot[]): BlockModel[] {
  const byBlock = new Map<string, YardSlot[]>();
  for (const s of slots) {
    const b = (s.block || "").trim();
    if (!byBlock.has(b)) byBlock.set(b, []);
    byBlock.get(b)!.push(s);
  }

  return [...byBlock.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((block) => {
      const containers = byBlock.get(block)!;
      const stacks = new Map<string, StackPos>();

      for (const s of containers) {
        const bay = String(s.bay).trim();
        const row = String(s.row).trim();
        const key = `${bay}|${row}`;
        let pos = stacks.get(key);
        if (!pos) {
          pos = {
            bay,
            row,
            containers: [],
            stackHeight: 0,
            maxRisk: 0,
            riskLevel: "Low",
            heightGap: 0,
            hasImdg: false,
          };
          stacks.set(key, pos);
        }
        pos.containers.push(s);
        pos.hasImdg = pos.hasImdg || s.is_imdg;
        pos.heightGap = Math.max(pos.heightGap, s.height_gap ?? 0);
        if (s.risk_score >= pos.maxRisk) {
          pos.maxRisk = s.risk_score;
          pos.riskLevel = s.risk_level;
        }
      }

      for (const pos of stacks.values()) {
        pos.containers.sort(
          (a, b) => (a.stack_rank ?? a.tier) - (b.stack_rank ?? b.tier)
        );
        pos.stackHeight = pos.containers.length;
      }

      const bays = sortBays([...new Set(containers.map((c) => String(c.bay).trim()))]);
      const rows = sortRows([...new Set(containers.map((c) => String(c.row).trim()))]);

      return {
        block,
        containers,
        bays,
        bayCols: bayColumns(bays),
        rows,
        stacks,
        ctrCount: containers.length,
        stackCount: stacks.size,
        highCount: containers.filter((c) => c.risk_level === "High" || c.risk_score >= 70).length,
        gapCount: [...stacks.values()].filter((p) => p.heightGap >= 2).length,
      };
    });
}

export function YardPlan({ yardMap, currentWindKmh = 0 }: Props) {
  const blocks = useMemo(() => buildBlocks(yardMap?.slots ?? []), [yardMap]);

  const [focusBlock, setFocusBlock] = useState<string>("ALL");
  const [hover, setHover] = useState<{ slot: YardSlot; x: number; y: number } | null>(null);

  const visible = focusBlock === "ALL" ? blocks : blocks.filter((b) => b.block === focusBlock);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-harbor-900/10 px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Yard Layout · Terminal Schematic</h2>
          <p className="text-xs text-steel-500">Terminal → Block → Bay → Row → Tier</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[11px] uppercase tracking-wide text-steel-500">
            Focus
            <select
              className="ml-2 border border-harbor-900/15 bg-white px-2 py-1 text-sm"
              value={focusBlock}
              onChange={(e) => setFocusBlock(e.target.value)}
            >
              <option value="ALL">Tous les blocs</option>
              {blocks.map((b) => (
                <option key={b.block} value={b.block}>
                  Block {b.block}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-[11px] text-steel-500">
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-3 rounded-sm bg-[#16a34a]" /> Low
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-3 rounded-sm bg-[#ea580c]" /> Medium
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-3 rounded-sm bg-[#dc2626]" /> High
            </span>
            <span className="text-amber-600">⚠ &gt;{STACK_LIMIT} tiers</span>
          </div>
        </div>
      </div>

      <div
          data-yard-root
          className="relative max-h-[640px] overflow-auto p-4"
          style={{
            backgroundColor: "#0b1220",
            backgroundImage:
              "linear-gradient(rgba(51,65,85,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(51,65,85,0.25) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          onMouseLeave={() => setHover(null)}
        >
          <div className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">
            EUROGATE TANGER MED · CONTAINER YARD
          </div>

          <div
            className={`grid gap-4 ${
              focusBlock === "ALL"
                ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                : "grid-cols-1"
            }`}
          >
            {visible.map((blk) => (
              <section
                key={blk.block}
                className="overflow-hidden rounded border border-slate-600 bg-slate-950/90 shadow-lg"
              >
                <header className="border-b border-slate-700 bg-slate-900 px-3 py-2">
                  <div className="font-display text-sm font-bold tracking-wide text-slate-100">
                    BLOCK {blk.block}
                  </div>
                </header>

                <div className="overflow-x-auto p-3">
                  <table className="border-separate border-spacing-1">
                    <thead>
                      <tr>
                        <th className="px-1 text-left text-[9px] font-semibold uppercase text-slate-500">
                          Row\\Bay
                        </th>
                        {blk.bayCols.map((col) =>
                          col.type === "gap" ? (
                            <th
                              key={col.key}
                              className="w-3 px-0 text-center text-[8px] text-slate-600"
                              title="Bays non consécutifs — pas des voisins"
                            >
                              ·
                            </th>
                          ) : (
                            <th
                              key={col.bay}
                              className="min-w-[44px] px-0.5 text-center text-[10px] font-bold text-slate-400"
                            >
                              {col.bay.replace(/^0+/, "") || col.bay}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {blk.rows.map((row) => (
                        <tr key={row}>
                          <td className="pr-2 text-[10px] font-semibold text-slate-500">
                            {row.replace(/^0+/, "") || row}
                          </td>
                          {blk.bayCols.map((col) => {
                            if (col.type === "gap") {
                              return (
                                <td key={`${col.key}|${row}`} className="align-bottom">
                                  <div
                                    className="mx-auto h-14 w-2 border-l border-dashed border-slate-600/80"
                                    title="Emplacement vide (bays non adjacents)"
                                  />
                                </td>
                              );
                            }
                            const bay = col.bay;
                            const pos = blk.stacks.get(`${bay}|${row}`);
                            if (!pos) {
                              return (
                                <td key={`${bay}|${row}`} className="align-bottom">
                                  <div className="mx-auto h-14 w-10 rounded-sm border border-dashed border-slate-700/80 bg-slate-900/40" />
                                </td>
                              );
                            }
                            const over = pos.stackHeight > STACK_LIMIT;
                            return (
                              <td key={`${bay}|${row}`} className="align-bottom">
                                <div
                                  className={`relative mx-auto flex w-10 flex-col-reverse gap-[2px] rounded-sm p-[2px] ${
                                    pos.hasImdg
                                      ? "ring-1 ring-amber-400"
                                      : "ring-1 ring-slate-700"
                                  }`}
                                  style={{ minHeight: 56 }}
                                >
                                  {over ? (
                                    <span
                                      className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-[10px] text-amber-300"
                                      title={`Stack ${pos.stackHeight} > limit ${STACK_LIMIT}`}
                                    >
                                      ⚠
                                    </span>
                                  ) : null}
                                  {pos.containers.map((ctr) => (
                                    <button
                                      key={ctr.container_id}
                                      type="button"
                                      className="relative h-[13px] w-full rounded-[2px] transition hover:brightness-125"
                                      style={{
                                        backgroundColor: riskColor(ctr.risk_level, ctr.risk_score),
                                      }}
                                      title={`${ctr.container_id} · rang ${ctr.stack_rank ?? ctr.tier}/${pos.stackHeight} · ${ctr.risk_level}`}
                                      onMouseEnter={(e) => {
                                        const root = e.currentTarget.closest(
                                          "[data-yard-root]"
                                        ) as HTMLElement | null;
                                        const rect = root?.getBoundingClientRect();
                                        setHover({
                                          slot: ctr,
                                          x: e.clientX - (rect?.left ?? 0) + root!.scrollLeft + 14,
                                          y: e.clientY - (rect?.top ?? 0) + root!.scrollTop + 14,
                                        });
                                      }}
                                      onMouseMove={(e) => {
                                        const root = e.currentTarget.closest(
                                          "[data-yard-root]"
                                        ) as HTMLElement | null;
                                        const rect = root?.getBoundingClientRect();
                                        if (!root || !rect) return;
                                        setHover({
                                          slot: ctr,
                                          x: e.clientX - rect.left + root.scrollLeft + 14,
                                          y: e.clientY - rect.top + root.scrollTop + 14,
                                        });
                                      }}
                                    >
                                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[7px] font-bold leading-none text-white/90">
                                        {ctr.stack_rank ?? ctr.tier}
                                      </span>
                                    </button>
                                  ))}
                                  <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl bg-black/50 px-0.5 text-[8px] font-bold text-white">
                                    {pos.stackHeight}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          {hover ? (
            <div
              className="pointer-events-none absolute z-30 max-w-[250px] rounded border border-slate-500 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-100 shadow-2xl"
              style={{ left: Math.min(hover.x, 280), top: hover.y }}
            >
              <div className="font-semibold text-white">{hover.slot.container_id}</div>
              <div>
                Block {hover.slot.block} · Bay {hover.slot.bay} · Row {hover.slot.row}
              </div>
              <div>
                Rang {hover.slot.stack_rank ?? hover.slot.tier} /{" "}
                {hover.slot.occupied_count ?? hover.slot.stack_height} CTR · TOS T{hover.slot.tier}
              </div>
              <div>Weight {(hover.slot.weight_kg / 1000).toFixed(1)} t</div>
              <div>IMO {hover.slot.imo_class ?? (hover.slot.is_imdg ? "?" : "—")}</div>
              <div>
                Risk {hover.slot.risk_level} · {hover.slot.risk_score}/100
              </div>
              <div>
                Pile {hover.slot.stability_score ?? "—"} · CTR {hover.slot.container_score ?? "—"}
              </div>
              <div>
                Voisinage h{hover.slot.neighborhood_height ?? 0} · Gauche{" "}
                {hover.slot.has_left_neighbor ? "oui" : "non"} · Droite{" "}
                {hover.slot.has_right_neighbor ? "oui" : "non"}
              </div>
              <div>Wind {Math.round(hover.slot.wind_speed_kmh ?? currentWindKmh)} km/h</div>
            </div>
          ) : null}
        </div>
    </div>
  );
}
