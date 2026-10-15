import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    container_id: { type: String, default: null },
    block: { type: String, default: null },
    alert_color: { type: String, enum: ["green", "orange", "red"], required: true },
    risk_score: { type: Number, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    factors: { type: [String], default: [] },
    acknowledged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Alert = mongoose.model("Alert", alertSchema);
