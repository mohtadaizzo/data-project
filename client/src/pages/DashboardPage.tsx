import { useEffect, useState } from "react";
import { AlertTriangle, Container, Radio, Wind } from "lucide-react";
import { AlertFeed } from "../components/AlertFeed";
import { KpiCard } from "../components/KpiCard";
import { YardPlan } from "../components/YardPlan";
import { WeatherRiskCharts } from "../components/WeatherRiskCharts";
import { useAlertSocket } from "../hooks/useAlertSocket";
import { api, type AlertItem, type DashboardSummary } from "../services/api";

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { liveAlerts } = useAlertSocket(true);

  async function load() {
    try {
      setError(null);
      const s = await api.summary();
      setSummary(s);
      setAlerts((s.day_alerts as AlertItem[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger le dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && !summary) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-harbor-700">
        Chargement du terminal EUROGATE…
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="mx-auto max-w-xl panel p-6 text-center">
        <p className="font-display text-xl font-semibold">Backend indisponible</p>
        <p className="mt-2 text-sm text-steel-500">{error}</p>
        <p className="mt-3 text-xs text-steel-500">
          Lancez Express : <code>cd server && npm run dev</code> (port 5000) + MongoDB
        </p>
        <button
          onClick={load}
          className="mt-4 bg-harbor-800 px-4 py-2 text-sm font-semibold text-white"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Conteneurs"
          value={summary.total_containers}
          hint="Inventaire yard actif"
          icon={<Container className="h-5 w-5" />}
          accent="teal"
        />
        <KpiCard
          label="Dangereux (IMDG)"
          value={summary.dangerous_containers}
          hint="Matières dangereuses"
          icon={<AlertTriangle className="h-5 w-5" />}
          accent="orange"
        />
        <KpiCard
          label="Alertes"
          value={summary.alerts_count}
          hint={`${summary.red_alerts} rouges · ${summary.orange_alerts} oranges`}
          icon={<Radio className="h-5 w-5" />}
          accent="red"
        />
        <KpiCard
          label="Vent du jour"
          value={`${Math.round(summary.current_wind_kmh)} km/h`}
          hint={`Score moy. ${summary.avg_risk_score}`}
          icon={<Wind className="h-5 w-5" />}
        />
      </section>

      <div className="grid gap-4">
        <YardPlan yardMap={summary.yard_map} currentWindKmh={summary.current_wind_kmh} />
        <AlertFeed alerts={alerts} live={liveAlerts as AlertItem[]} />
      </div>

      <WeatherRiskCharts summary={summary} />
    </div>
  );
}
