import mongoose from "mongoose";

const riskSchema = new mongoose.Schema(
  {
    container_id: { type: String, required: true, index: true },
    risk_level: { type: String, enum: ["Low", "Medium", "High"], required: true },
    risk_score: { type: Number, required: true },
    stability_score: { type: Number, default: 0 },
    container_score: { type: Number, default: 0 },
    alert_color: { type: String, enum: ["green", "orange", "red"], required: true },
    explanation: { type: String, default: "" },
    factors: { type: [String], default: [] },
    shap_values: { type: mongoose.Schema.Types.Mixed, default: null },
    model_version: { type: String, default: "rules-v1" },
    wind_speed_kmh: { type: Number, default: null },
    assessed_at: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "risk_assessments" }
);

export const RiskAssessment = mongoose.model("RiskAssessment", riskSchema);
