// Cloudflare Worker: the same AI guide as api/chat.js, for hosting it outside Vercel.
// Secrets/vars: ANTHROPIC_API_KEY (secret), SITE_URL (where the site's files are published), ALLOWED_ORIGIN.
import Anthropic from "@anthropic-ai/sdk";
import { chatTurn, checkRequest, errorMessage, limited } from "../server/core.js";
import { latestVideos } from "../server/videos.js";

export default {
  async fetch(request, env, ctx) {
    // The site's own addresses (http or https, with or without www) and any origin listed in ALLOWED_ORIGIN (comma separated).
    const listed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const ok = /^https?:\/\/(www\.)?contradictionai\.com$/.test(origin) || origin === "https://sharkascent-hue.github.io" || origin === "https://contradiction-site.contradiction.workers.dev" || listed.includes(origin);
    const cors = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN === "*" ? "*" : (ok ? origin : "https://www.contradictionai.com"), "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET" && new URL(request.url).searchParams.has("videos")) {
      const cache = caches.default, key = new Request("https://cache.local/videos-v1");
      let hit = await cache.match(key);
      if (!hit) {
        hit = new Response(JSON.stringify(await latestVideos(env.SITE_URL || "https://sharkascent-hue.github.io/Contradiction/")), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=3600" } });
        ctx.waitUntil(cache.put(key, hit.clone()));
      }
      return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "max-age=600" } });
    }
    if (request.method === "GET") return json(env.ANTHROPIC_API_KEY ? 200 : 503, { ok: !!env.ANTHROPIC_API_KEY });
    if (request.method !== "POST") return json(405, { error: "Use POST." });
    if (!env.ANTHROPIC_API_KEY) return json(503, { error: "The AI guide is not switched on: the server has no API key." });
    // Only this site may use the AI: other websites and scripts without the site's origin are refused.
    if (!ok) return json(403, { error: "This AI guide only answers questions asked on Contradiction AI." });
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (limited(ip)) return json(429, { error: "Too many questions in a short time. Try again in a minute." });
    // Cloudflare's rate limiter, shared by every server instance: per visitor, and for the whole site.
    try {
      const rl = env.RL_IP ? await env.RL_IP.limit({ key: ip }) : null;
      if (rl && !rl.success) return json(429, { error: "Too many questions in a short time. Try again in a minute." });
      if (env.RL_ALL && !(await env.RL_ALL.limit({ key: "all" })).success) return json(429, { error: "The AI guide is very busy right now. Try again in a minute." });
    } catch (e) {}
    const body = await request.json().catch(() => null);
    const bad = checkRequest(body);
    if (bad) return json(400, { error: bad });
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter(), enc = new TextEncoder();
    const emit = e => writer.write(enc.encode(JSON.stringify(e) + "\n"));
    ctx.waitUntil((async () => {
      try {
        await chatTurn({ body, siteUrl: env.SITE_URL || "https://sharkascent-hue.github.io/Contradiction/", emit, client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) });
      } catch (e) { emit({ t: "error", d: errorMessage(e)[1] }); }
      writer.close();
    })());
    return new Response(readable, { headers: { ...cors, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  },
};
