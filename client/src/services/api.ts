/** Same-origin by default so Vite proxies /api and /socket.io → Express :5000 */
const API_URL = import.meta.env.VITE_API_URL ?? "";
export const WS_URL = import.meta.env.VITE_WS_URL || (typeof window !== "undefined" ? window.location.origin : "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204 || res.status === 304) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type YardSlot = {
  container_id: string;
  block: string;
  bay: string;
  row: string;
  tier: number;
  stack_rank?: number | null;
  occupied_count?: number | null;
  stack_height: number;
  is_imdg: boolean;
  imo_class?: string | null;
  weight_kg: number;
  risk_score: number;
  risk_level: string;
  alert_color: string;
  explanation?: string | null;
  lat: number;
  lng: number;
  height_gap?: number | null;
  neighbor_count?: number | null;
  neighbor_container_count?: number | null;
  neighbor_min_height?: number | null;
  stack_exposure?: string | null;
  has_left_neighbor?: boolean | null;
  has_right_neighbor?: boolean | null;
  laterally_exposed?: boolean | null;
  neighborhood_height?: number | null;
  stability_score?: number | null;
  container_score?: number | null;
  wind_speed_kmh?: number | null;
};

export type YardMap = {
  slots: YardSlot[];
  blocks: Array<{
    block: string;
    south: number;
    north: number;
    west: number;
    east: number;
    container_count: number;
    avg_risk_score: number;
    max_risk_score: number;
    origin: number[];
  }>;
  height_gap_alerts: number;
};

export type AlertItem = {
  id: number | string;
  container_id?: string;
  block?: string;
  alert_color: "green" | "orange" | "red" | string;
  risk_score: number;
  title: string;
  message: string;
  factors?: string[] | null;
  acknowledged: boolean;
  created_at?: string;
};

export type DashboardSummary = {
  total_containers: number;
  dangerous_containers: number;
  alerts_count: number;
  red_alerts: number;
  orange_alerts: number;
  green_alerts: number;
  current_wind_kmh: number;
  current_gust_kmh: number;
  weather_date?: string | null;
  weather_start?: string | null;
  weather_end?: string | null;
  avg_risk_score: number;
  risk_level_counts: Record<string, number>;
  blocks: Array<{
    block: string;
    container_count: number;
    avg_risk_score: number;
    max_risk_score: number;
    dangerous_count: number;
    lat: number;
    lng: number;
  }>;
  risk_score_series: Array<{
    t: string;
    score: number;
    level: string;
    container_id: string;
    wind?: number;
    high?: number;
    red?: number;
  }>;
  weather_series: Array<{
    t: string;
    wind: number;
    gust?: number;
    temp?: number;
    rain?: number;
    visibility?: number;
  }>;
  height_gap_alerts?: number;
  yard_map?: YardMap | null;
  day_alerts?: AlertItem[];
};

export type PredictPayload = Record<string, unknown>;

export type PredictResult = {
  risk_level: string;
  risk_score: number;
  alert_color: string;
  explanation: string;
  shap: Array<{ feature: string; shap_value: number }>;
  model_version?: string;
  stability_score?: number;
  container_score?: number;
};

export const api = {
  summary: (date?: string) =>
    request<DashboardSummary>(`/api/v1/dashboard/summary${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  alerts: (limit = 40) => request<AlertItem[]>(`/api/v1/alerts?limit=${limit}`),
  predict: (body: PredictPayload) =>
    request<PredictResult>("/api/v1/predict", { method: "POST", body: JSON.stringify(body) }),
  seed: () => request<unknown>("/api/v1/admin/seed", { method: "POST" }),
};
