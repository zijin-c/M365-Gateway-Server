const origin = process.env.HEALTHCHECK_ORIGIN || "http://127.0.0.1:8787";
const response = await fetch(new URL("/api/health", origin), {
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`health check failed with HTTP ${response.status}`);
const body = await response.json();
if (!body || typeof body !== "object") throw new Error("health check returned an invalid body");
console.log(JSON.stringify({ ok: true, status: response.status }));
