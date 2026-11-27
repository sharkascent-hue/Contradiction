// A mirror of the site served from the GitHub repository, for when the custom domain is not reachable.
const SRC = "https://raw.githubusercontent.com/sharkascent-hue/Contradiction/main/";
const TYPES = { html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", bin: "application/octet-stream", txt: "text/plain; charset=utf-8", xml: "application/xml" };
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    let path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!path || path.endsWith("/")) path += "index.html";
    if (path.includes("..")) return new Response("Bad path", { status: 400 });
    const r = await fetch(SRC + path.split("/").map(encodeURIComponent).join("/"), { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) return new Response("Not found", { status: 404 });
    const ext = (path.split(".").pop() || "").toLowerCase();
    return new Response(r.body, { headers: { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": path === "index.html" ? "no-cache" : "public, max-age=300" } });
  }
};
