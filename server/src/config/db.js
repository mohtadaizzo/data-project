import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/eurogate_risk";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log(`[mongo] connected ${uri}`);
}
