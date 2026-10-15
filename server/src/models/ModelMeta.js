import mongoose from "mongoose";

const modelMetaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ["ml", "dl", "ensemble"], required: true },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    path: { type: String, default: "" },
    trained_at: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "models_meta" }
);

export const ModelMeta = mongoose.model("ModelMeta", modelMetaSchema);
