import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { connectDb } from "../src/config/db.js";
import { Container } from "../src/models/Container.js";
import { Weather } from "../src/models/Weather.js";
import { RiskAssessment } from "../src/models/RiskAssessment.js";
import { Alert } from "../src/models/Alert.js";
import { ModelMeta } from "../src/models/ModelMeta.js";
import { DailyRisk } from "../src/models/DailyRisk.js";
import { scoreYard, summarizeScores } from "../src/services/riskScore.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const processed = path.join(root, "data", "processed");

function readCsv(name) {
  const p = path.join(processed, name);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p} — run: python -m ai.pipeline.run_spark_etl`);
  }
  const text = fs.readFileSync(p, "utf-8");
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function bool(v) {
  return ["true", "True", "1", "TRUE", "yes", "Y"].includes(String(v));
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function parseDate(v) {
  if (!v || v === "nan" || v === "None") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  await connectDb();
  const yard = readCsv("yard_enriched.csv");
  let climate = [];
  try {
    climate = readCsv("climate_enriched.csv");
  } catch {
    console.warn("[seed] climate_enriched.csv missing — weather skipped");
  }

  console.log(`[seed] clearing collections…`);
  await Promise.all([
    Container.deleteMany({}),
    Weather.deleteMany({}),
    RiskAssessment.deleteMany({}),
    Alert.deleteMany({}),
    DailyRisk.deleteMany({}),
  ]);

  const weatherDocs = [];
  if (climate.length) {
    for (const r of climate) {
      const observed_at = parseDate(r.DateTime);
      if (!observed_at) continue;
      weatherDocs.push({
        observed_at,
        wind_speed_kmh: num(r.Wind_Speed_kmh),
        gust_kmh: 0,
        wind_direction: 0,
        temperature_c: 0,
        humidity_pct: 0,
        pressure_hpa: 0,
        rain_mm: 0,
        visibility_km: 0,
      });
    }
    weatherDocs.sort((a, b) => a.observed_at - b.observed_at);
    await Weather.insertMany(weatherDocs, { ordered: false }).catch(() => {});
    console.log(`[seed] weather=${weatherDocs.length}`);
  }

  const containers = yard.map((r) => ({
    container_id: String(r.Container_ID),
    block: String(r.Block || "").trim(),
    bay: String(r.Bay || "").trim(),
    row: String(r.Row || "").trim(),
    tier: num(r.Tier, 1),
    stack_height: num(r.Stack_Height, 1),
    weight_kg: 0,
    container_type: bool(r.Is_Reefer) ? "REEFER" : "DRY",
    is_full: bool(r.Is_Full),
    is_reefer: bool(r.Is_Reefer),
    is_imdg: bool(r.Is_IMDG),
    imo_class: null,
    check_in: parseDate(r.Entry_Date),
    check_out: null,
    status: "IN_YARD",
    height_gap: num(r.Height_Gap),
    neighbor_min_height: num(r.Neighbor_Min_Height, 1),
    neighbor_count: num(r.Neighbor_Count, 0),
    neighbor_container_count: num(r.Neighbor_Container_Count, 0),
    stack_exposure: r.Stack_Exposure || "isolated",
    has_left_neighbor: bool(r.Has_Left_Neighbor),
    has_right_neighbor: bool(r.Has_Right_Neighbor),
    laterally_exposed: bool(r.Laterally_Exposed),
  }));

  const lastWx = weatherDocs[weatherDocs.length - 1];
  scoreYard(containers, lastWx?.wind_speed_kmh ?? 0, lastWx?.gust_kmh ?? 0);
  const dailyDocs = weatherDocs.map((w) => {
    const s = summarizeScores(
      scoreYard(containers, w.wind_speed_kmh, w.gust_kmh, { applyNeighbors: false })
    );
    return {
      observed_at: w.observed_at,
      wind_speed_kmh: w.wind_speed_kmh,
      gust_kmh: w.gust_kmh,
      avg_risk_score: s.avg_risk_score,
      max_risk_score: s.max_risk_score,
      high: s.high,
      medium: s.medium,
      low: s.low,
      red: s.red,
      orange: s.orange,
      green: s.green,
    };
  });
  if (dailyDocs.length) {
    await DailyRisk.insertMany(dailyDocs);
    console.log(`[seed] daily_risks=${dailyDocs.length}`);
  }

  const scored = scoreYard(containers, lastWx?.wind_speed_kmh ?? 0, lastWx?.gust_kmh ?? 0);
  const risks = [];
  const alerts = [];
  for (const c of containers) {
    const r = scored[c.container_id];
    if (!r) continue;
    risks.push({
      container_id: c.container_id,
      risk_level: r.risk_level,
      risk_score: r.risk_score,
      stability_score: r.stability_score,
      container_score: r.container_score,
      alert_color: r.alert_color,
      explanation: r.explanation,
      factors: r.factors,
      model_version: "daily-wind-v1",
      wind_speed_kmh: r.wind_speed_kmh,
      assessed_at: lastWx?.observed_at || new Date(),
    });
    if (r.alert_color === "orange" || r.alert_color === "red" || r.risk_score >= 40) {
      alerts.push({
        container_id: c.container_id,
        block: c.block,
        alert_color: r.alert_color,
        risk_score: r.risk_score,
        title:
          r.alert_color === "red"
            ? "Alerte rouge — risque critique"
            : "Alerte orange — risque modéré",
        message: r.explanation,
        factors: r.factors,
      });
    }
  }

  await Container.insertMany(containers);
  await RiskAssessment.insertMany(risks);
  if (alerts.length) await Alert.insertMany(alerts);

  const metaPath = path.join(root, "ai", "artifacts", "train_meta.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    await ModelMeta.deleteMany({});
    const docs = [];
    if (meta.ml) docs.push({ name: "spark_random_forest", kind: "ml", metrics: meta.ml, path: "ai/artifacts/ml_model" });
    if (meta.dl) docs.push({ name: "pytorch_mlp", kind: "dl", metrics: meta.dl, path: "ai/artifacts/dl_model.pt" });
    if (docs.length) await ModelMeta.insertMany(docs);
  }

  console.log(
    `[seed] ok containers=${containers.length} risks=${risks.length} alerts=${alerts.length} last_wind=${lastWx?.wind_speed_kmh}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
