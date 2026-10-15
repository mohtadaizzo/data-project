import { Router } from "express";
import { Container } from "../models/Container.js";
import { Weather } from "../models/Weather.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { Alert } from "../models/Alert.js";
import { ModelMeta } from "../models/ModelMeta.js";
import { buildYardSlots, blockSummaries } from "../services/yardLayout.js";
import { scoreYard, summarizeScores } from "../services/riskScore.js";
import { aiPredict, aiHealth } from "../services/aiClient.js";

function localISO(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pickWeatherDay(weatherDays, dateQuery) {
  if (!weatherDays.length) return null;
  if (dateQuery) {
    const wanted = String(dateQuery).slice(0, 10);
    return weatherDays.find((w) => localISO(w.observed_at) === wanted) || weatherDays[0];
  }
  const today = localISO(new Date());
  return weatherDays.find((w) => localISO(w.observed_at) === today) || weatherDays[0];
}

export function createApiRouter(io) {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const ai = await aiHealth();
    res.json({ status: "ok", service: "eurogate-express", ai });
  });

  router.get("/dashboard/summary", async (req, res, next) => {
    try {
      const [containers, weatherDays] = await Promise.all([
        Container.find().lean(),
        Weather.find().sort({ observed_at: 1 }).lean(),
      ]);

      const wx = pickWeatherDay(weatherDays, req.query.date);

      const wind = wx?.wind_speed_kmh ?? 0;
      const gust = wx?.gust_kmh ?? 0;
      const scored = scoreYard(containers, wind, gust);
      const stats = summarizeScores(scored);
      const slots = buildYardSlots(containers, scored, wind);
      const blocks = blockSummaries(slots);
      const height_gap_alerts = slots.filter((s) => (s.height_gap || 0) >= 2).length;

      const alerts = Object.entries(scored)
        .filter(([, r]) => r.alert_color === "red" || r.alert_color === "orange")
        .sort((a, b) => b[1].risk_score - a[1].risk_score)
        .slice(0, 40)
        .map(([id, r]) => {
          const c = containers.find((x) => x.container_id === id);
          return {
            id,
            container_id: id,
            block: c?.block,
            alert_color: r.alert_color,
            risk_score: r.risk_score,
            title: r.alert_color === "red" ? "Alerte rouge — risque critique" : "Alerte orange — risque modéré",
            message: r.explanation,
            factors: r.factors,
            acknowledged: false,
            created_at: wx?.observed_at,
          };
        });

      const weather_series = weatherDays.map((w) => ({
        t: w.observed_at,
        wind: w.wind_speed_kmh,
        gust: w.gust_kmh,
        temp: w.temperature_c,
        rain: w.rain_mm,
        visibility: w.visibility_km,
      }));

      const risk_score_series = weatherDays.map((w) => {
        const s = summarizeScores(
          scoreYard(containers, w.wind_speed_kmh, w.gust_kmh, { applyNeighbors: false })
        );
        return {
          t: w.observed_at,
          score: s.avg_risk_score,
          wind: w.wind_speed_kmh,
          high: s.high,
          red: s.red,
          level: s.avg_risk_score >= 70 ? "High" : s.avg_risk_score >= 40 ? "Medium" : "Low",
          container_id: "",
        };
      });

      res.json({
        total_containers: containers.length,
        dangerous_containers: containers.filter((c) => c.is_imdg).length,
        alerts_count: stats.red + stats.orange,
        red_alerts: stats.red,
        orange_alerts: stats.orange,
        green_alerts: stats.green,
        current_wind_kmh: wind,
        current_gust_kmh: gust,
        weather_date: wx?.observed_at || null,
        weather_start: weatherDays[0]?.observed_at || null,
        weather_end: weatherDays[weatherDays.length - 1]?.observed_at || null,
        avg_risk_score: stats.avg_risk_score,
        risk_level_counts: stats.risk_level_counts,
        blocks,
        risk_score_series,
        weather_series,
        day_alerts: alerts,
        height_gap_alerts,
        yard_map: {
          slots,
          blocks: blocks.map((b) => ({
            block: b.block,
            south: 0,
            north: 0,
            west: 0,
            east: 0,
            container_count: b.container_count,
            avg_risk_score: b.avg_risk_score,
            max_risk_score: b.max_risk_score,
            origin: b.origin,
          })),
          height_gap_alerts,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/containers", async (req, res, next) => {
    try {
      const q = {};
      if (req.query.block) q.block = req.query.block;
      if (req.query.imdg_only === "true") q.is_imdg = true;
      const limit = Math.min(parseInt(req.query.limit || "200", 10), 2000);
      const rows = await Container.find(q).limit(limit).lean();
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.get("/weather", async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "90", 10), 400);
      const rows = await Weather.find().sort({ observed_at: -1 }).limit(limit).lean();
      res.json(rows.reverse());
    } catch (err) {
      next(err);
    }
  });

  router.get("/alerts", async (req, res, next) => {
    try {
      const q = {};
      if (req.query.color) q.alert_color = req.query.color;
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);
      const rows = await Alert.find(q).sort({ createdAt: -1 }).limit(limit).lean();
      res.json(
        rows.map((a) => ({
          id: a._id,
          container_id: a.container_id,
          block: a.block,
          alert_color: a.alert_color,
          risk_score: a.risk_score,
          title: a.title,
          message: a.message,
          factors: a.factors,
          acknowledged: a.acknowledged,
          created_at: a.createdAt,
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  router.get("/yard/map", async (req, res, next) => {
    try {
      const containers = await Container.find().lean();
      const weatherDays = await Weather.find().sort({ observed_at: 1 }).lean();
      const wx = pickWeatherDay(weatherDays, req.query.date);
      const scored = scoreYard(containers, wx?.wind_speed_kmh ?? 0, wx?.gust_kmh ?? 0);
      const slots = buildYardSlots(containers, scored, wx?.wind_speed_kmh ?? 0);
      const blocks = blockSummaries(slots);
      res.json({
        slots,
        blocks: blocks.map((b) => ({
          block: b.block,
          south: 0,
          north: 0,
          west: 0,
          east: 0,
          container_count: b.container_count,
          avg_risk_score: b.avg_risk_score,
          max_risk_score: b.max_risk_score,
          origin: b.origin,
        })),
        height_gap_alerts: slots.filter((s) => (s.height_gap || 0) >= 2).length,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/models", async (_req, res, next) => {
    try {
      res.json(await ModelMeta.find().sort({ trained_at: -1 }).lean());
    } catch (err) {
      next(err);
    }
  });

  router.post("/predict", async (req, res, next) => {
    try {
      const model = req.query.model || "ensemble";
      const result = await aiPredict(req.body, model);
      if (result.alert_color === "orange" || result.alert_color === "red") {
        const alert = await Alert.create({
          container_id: req.body.container_id || null,
          block: req.body.Block || req.body.block || null,
          alert_color: result.alert_color,
          risk_score: result.risk_score,
          title:
            result.alert_color === "red"
              ? "Alerte critique temps réel"
              : "Alerte temps réel",
          message: result.explanation,
          factors: result.factors || [],
        });
        io.emit("alert", {
          id: alert._id,
          container_id: alert.container_id,
          block: alert.block,
          alert_color: alert.alert_color,
          risk_score: alert.risk_score,
          title: alert.title,
          message: alert.message,
          created_at: alert.createdAt,
        });
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
