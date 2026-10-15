import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { WS_URL } from "../services/api";

export type LiveAlert = {
  id?: string | number;
  container_id?: string;
  block?: string;
  alert_color: string;
  risk_score: number;
  title: string;
  message: string;
  created_at?: string;
};

export function useAlertSocket(enabled = true) {
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const socket: Socket = io(WS_URL, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("alert", (alert: LiveAlert) => {
      setLiveAlerts((prev) => [alert, ...prev].slice(0, 20));
    });
    return () => {
      socket.disconnect();
    };
  }, [enabled]);

  return { liveAlerts, connected };
}
