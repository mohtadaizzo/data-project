import mongoose from "mongoose";

const weatherSchema = new mongoose.Schema(
  {
    observed_at: { type: Date, required: true, unique: true, index: true },
    wind_speed_kmh: { type: Number, required: true },
    gust_kmh: { type: Number, default: 0 },
    wind_direction: { type: Number, default: 0 },
    temperature_c: { type: Number, default: 0 },
    humidity_pct: { type: Number, default: 0 },
    pressure_hpa: { type: Number, default: 0 },
    rain_mm: { type: Number, default: 0 },
    visibility_km: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "weather" }
);

export const Weather = mongoose.model("Weather", weatherSchema);
