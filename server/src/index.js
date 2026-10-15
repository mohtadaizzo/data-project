import http from "http";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { connectDb } from "./config/db.js";
import { createApiRouter } from "./routes/api.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*" },
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.set("etag", false);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({
    name: "EUROGATE MERN API",
    docs: "/api/v1/health",
    stack: "Express + MongoDB + Socket.io",
  });
});

app.use("/api/v1", createApiRouter(io));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

io.on("connection", (socket) => {
  socket.emit("connected", { message: "EUROGATE alert stream ready" });
  socket.on("ping", () => socket.emit("pong"));
});

const port = Number(process.env.PORT || 5000);

await connectDb();
server.listen(port, () => {
  console.log(`[express] http://127.0.0.1:${port}`);
});
