import { scoreUrl } from "./score.js";
import { runDiscovery } from "./discover.js";
import { listQueue, actOnCandidate } from "./queue.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const errorJson = (e, status = 500) =>
  json({ error: String(e && e.message ? e.message : e) }, status);

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true, time: new Date().toISOString() });
  }

  if (path === "/api/score-url" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const target = (body.url || "").trim();
    if (!target) return errorJson("url required", 400);
    const lead = await scoreUrl(target, env);
    return json({ lead });
  }

  const requireQueue = () =>
    errorJson("Queue not configured. Create a KV namespace (see wrangler.toml) and redeploy.", 503);

  if (path === "/api/discover" && method === "POST") {
    if (!env.QUEUE) return requireQueue();
    const body = await request.json().catch(() => ({}));
    const added = await runDiscovery(env, { limit: body.limit || 25 });
    return json({ added });
  }

  if (path === "/api/queue" && method === "GET") {
    if (!env.QUEUE) return requireQueue();
    const status = url.searchParams.get("status") || "pending";
    const items = await listQueue(env, { status });
    return json({ items });
  }

  const m = path.match(/^\/api\/queue\/([^/]+)\/(confirm|reject|snooze)$/);
  if (m && method === "POST") {
    if (!env.QUEUE) return requireQueue();
    const [, id, action] = m;
    const body = await request.json().catch(() => ({}));
    const result = await actOnCandidate(env, id, action, body);
    return json(result);
  }

  return errorJson("not found", 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, ctx);
      } catch (e) {
        console.error("api error", e);
        return errorJson(e, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (!env.QUEUE) {
      console.warn("cron skipped — KV namespace not configured");
      return;
    }
    ctx.waitUntil(
      runDiscovery(env, { limit: 25 }).catch((e) => console.error("cron discovery failed", e))
    );
  },
};
