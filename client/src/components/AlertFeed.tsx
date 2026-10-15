import { Circle } from "lucide-react";
import type { AlertItem } from "../services/api";

const colorMap: Record<string, string> = {
  green: "text-alert-green",
  orange: "text-alert-orange",
  red: "text-alert-red",
};

type Props = {
  alerts: AlertItem[];
  live?: AlertItem[];
};

export function AlertFeed({ alerts, live = [] }: Props) {
  const merged = [...live, ...alerts]
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id && x.message === a.message) === i)
    .slice(0, 12);

  return (
    <div className="panel flex h-full flex-col">
      <div className="border-b border-harbor-900/10 px-4 py-3">
        <h2 className="font-display text-lg font-semibold">Historique des alertes</h2>
        <p className="text-xs text-steel-500">Explications métier générées automatiquement</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {merged.length === 0 ? (
          <p className="text-sm text-steel-500">Aucune alerte pour le moment.</p>
        ) : (
          merged.map((a, idx) => (
            <article key={`${a.id ?? "live"}-${idx}`} className="border-l-2 border-harbor-300 pl-3">
              <div className="flex items-center gap-2">
                <Circle className={`h-2.5 w-2.5 fill-current ${colorMap[a.alert_color] || "text-steel-500"}`} />
                <span className="text-sm font-semibold text-harbor-900">{a.title}</span>
                <span className="ml-auto text-[11px] text-steel-500">
                  score {Math.round(a.risk_score)}
                </span>
              </div>
              <p className="mt-1 text-sm leading-snug text-harbor-800/90">{a.message}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-steel-500">
                {a.block ? `Bloc ${a.block}` : "—"}
                {a.container_id ? ` · ${a.container_id}` : ""}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
