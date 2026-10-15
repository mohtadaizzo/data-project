import mongoose from "mongoose";

const containerSchema = new mongoose.Schema(
  {
    container_id: { type: String, required: true, unique: true, index: true },
    block: { type: String, required: true, index: true },
    bay: { type: String, required: true },
    row: { type: String, required: true },
    tier: { type: Number, default: 1 },
    stack_height: { type: Number, default: 1 },
    weight_kg: { type: Number, default: 0 },
    container_type: { type: String, default: "DRY" },
    is_full: { type: Boolean, default: true },
    is_reefer: { type: Boolean, default: false },
    is_imdg: { type: Boolean, default: false },
    imo_class: { type: String, default: null },
    check_in: { type: Date, default: null },
    check_out: { type: Date, default: null },
    status: { type: String, default: "IN_YARD" },
    height_gap: { type: Number, default: 0 },
    neighbor_min_height: { type: Number, default: 1 },
    neighbor_count: { type: Number, default: 0 },
    neighbor_container_count: { type: Number, default: 0 },
    stack_exposure: { type: String, default: "isolated" },
    has_left_neighbor: { type: Boolean, default: false },
    has_right_neighbor: { type: Boolean, default: false },
    laterally_exposed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Container = mongoose.model("Container", containerSchema);
