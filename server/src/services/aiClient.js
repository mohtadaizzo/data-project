const AI_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8001";

export async function aiPredict(payload, model = "ensemble") {
  const res = await fetch(`${AI_URL}/predict?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI service ${res.status}: ${text}`);
  }
  return res.json();
}

export async function aiHealth() {
  try {
    const res = await fetch(`${AI_URL}/health`);
    if (!res.ok) return { status: "down" };
    return res.json();
  } catch {
    return { status: "down" };
  }
}
