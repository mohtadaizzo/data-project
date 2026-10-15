import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardSummary } from "../services/api";

type Props = {
  summary: DashboardSummary;
};

function fmt(t: string) {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function WeatherRiskCharts({ summary }: Props) {
  const weather = summary.weather_series.map((w) => ({
    ...w,
    label: fmt(w.t),
  }));
  const risk = summary.risk_score_series.map((r) => ({
    ...r,
    label: fmt(r.t),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-4">
        <h2 className="font-display text-lg font-semibold">Vent par jour</h2>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weather}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={30} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="wind" name="Vent km/h" stroke="#247484" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="gust" name="Rafales" stroke="#ea580c" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="font-display text-lg font-semibold">Risque moyen par jour</h2>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={risk}>
              <defs>
                <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={30} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="score" name="Risk moyen" stroke="#b91c1c" fill="url(#riskFill)" />
              <Line type="monotone" dataKey="wind" name="Vent km/h" stroke="#247484" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
