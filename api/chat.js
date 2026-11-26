// Vercel serverless function: POST /api/chat streams one turn of the AI guide (see server/core.js).
// Set ANTHROPIC_API_KEY in the Vercel project. GET returns {"ok":true} so the site knows the guide is on.
import Anthropic from "@anthropic-ai/sdk";
import { chatTurn, checkRequest, errorMessage, limited } from "../server/core.js";

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  const keyed = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (req.method === "GET") return res.status(keyed ? 200 : 503).json({ ok: keyed });
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!keyed) return res.status(503).json({ error: "The AI guide is not switched on: the server has no API key." });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "Too many questions in a short time. Try again in a minute." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const bad = checkRequest(body);
  if (bad) return res.status(400).json({ error: bad });
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const emit = e => res.write(JSON.stringify(e) + "\n");
  try {
    await chatTurn({ body, siteUrl: process.env.SITE_URL || "https://" + req.headers.host + "/", emit, client: new Anthropic() });
  } catch (e) {
    const [status, text] = errorMessage(e);
    if (!res.headersSent) return res.status(status).json({ error: text });
    emit({ t: "error", d: text });
  }
  res.end();
}
