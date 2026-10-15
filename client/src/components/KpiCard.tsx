import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  accent?: "default" | "green" | "orange" | "red" | "teal";
};

const accents = {
  default: "border-harbor-900/10",
  green: "border-alert-green/30",
  orange: "border-alert-orange/30",
  red: "border-alert-red/30",
  teal: "border-harbor-400/40",
};

export function KpiCard({ label, value, hint, icon, accent = "default" }: Props) {
  return (
    <div className={`panel px-4 py-3 ${accents[accent]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-harbor-700/70">{label}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-harbor-950">{value}</p>
          {hint ? <p className="mt-1 text-xs text-steel-500">{hint}</p> : null}
        </div>
        {icon ? <div className="text-harbor-500">{icon}</div> : null}
      </div>
    </div>
  );
}
