import mongoose from "mongoose";

const dailyRiskSchema = new mongoose.Schema(
  {
    observed_at: { type: Date, required: true, unique: true, index: true },
    wind_speed_kmh: { type: Number, required: true },
    gust_kmh: { type: Number, default: 0 },
    avg_risk_score: { type: Number, required: true },
    max_risk_score: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 },
    red: { type: Number, default: 0 },
    orange: { type: Number, default: 0 },
    green: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "daily_risks" }
);

export const DailyRisk = mongoose.model("DailyRisk", dailyRiskSchema);
