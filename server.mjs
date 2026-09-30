import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const apiUrl = "https://api.groq.com/openai/v1/chat/completions";
const allowedModels = new Set(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
const maxBodyBytes = 15 * 1024 * 1024;
const requestDurationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function recordRequest(metrics, method, route, status, duration) {
  const normalizedMethod = ["GET", "POST", "HEAD"].includes(method) ? method : "OTHER";
  const key = `${normalizedMethod}|${route}|${status}`;
  let sample = metrics.get(key);
  if (!sample) {
    sample = { method: normalizedMethod, route, status, count: 0, sum: 0, buckets: Array(requestDurationBuckets.length).fill(0) };
    metrics.set(key, sample);
  }
  sample.count++;
  sample.sum += duration;
  requestDurationBuckets.forEach((upperBound, index) => {
    if (duration <= upperBound) sample.buckets[index]++;
  });
}

function renderMetrics(metrics, apiConfigured) {
  const lines = [
    "# HELP outfit_roulette_http_requests_total Completed HTTP requests.",
    "# TYPE outfit_roulette_http_requests_total counter",
  ];

  for (const sample of metrics.values()) {
    const labels = `method="${sample.method}",route="${sample.route}",status="${sample.status}"`;
    lines.push(`outfit_roulette_http_requests_total{${labels}} ${sample.count}`);
  }

  lines.push(
    "# HELP outfit_roulette_http_request_duration_seconds HTTP request duration in seconds.",
    "# TYPE outfit_roulette_http_request_duration_seconds histogram",
  );
  for (const sample of metrics.values()) {
    const labels = `method="${sample.method}",route="${sample.route}",status="${sample.status}"`;
    requestDurationBuckets.forEach((upperBound, index) => {
      lines.push(
        `outfit_roulette_http_request_duration_seconds_bucket{${labels},le="${upperBound}"} ${sample.buckets[index]}`,
      );
    });
    lines.push(`outfit_roulette_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${sample.count}`);
    lines.push(`outfit_roulette_http_request_duration_seconds_sum{${labels}} ${sample.sum}`);
    lines.push(`outfit_roulette_http_request_duration_seconds_count{${labels}} ${sample.count}`);
  }

  const memory = process.memoryUsage();
  lines.push(
    "# HELP outfit_roulette_ai_configured Whether the server has an AI API key configured.",
    "# TYPE outfit_roulette_ai_configured gauge",
    `outfit_roulette_ai_configured ${apiConfigured ? 1 : 0}`,
    "# HELP outfit_roulette_process_uptime_seconds Node.js process uptime in seconds.",
    "# TYPE outfit_roulette_process_uptime_seconds gauge",
    `outfit_roulette_process_uptime_seconds ${process.uptime()}`,
    "# HELP outfit_roulette_process_resident_memory_bytes Process resident memory in bytes.",
    "# TYPE outfit_roulette_process_resident_memory_bytes gauge",
    `outfit_roulette_process_resident_memory_bytes ${memory.rss}`,
    "",
  );
  return lines.join("\n");
}

async function loadLocalEnv() {
  try {
    const contents = await readFile(join(root, ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^(["'])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

async function proxyCompletion(request, response, { apiKey, fetchImpl }) {
  if (!apiKey) {
    sendJson(response, 503, {
      error: { message: "AI is not configured yet. Add GROQ_API_KEY to .env and restart the app." },
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: { message: error.message } });
    return;
  }

  if (!allowedModels.has(body.model) || !Array.isArray(body.messages) || body.messages.length === 0) {
    sendJson(response, 400, { error: { message: "Unsupported model or missing messages." } });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70000);
  response.on("close", () => {
    if (!response.writableEnded) controller.abort();
  });

  try {
    const upstream = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        reasoning_effort: body.reasoning_effort,
      }),
      signal: controller.signal,
    });
    const content = await upstream.text();
    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(content);
  } catch (error) {
    if (!response.writableEnded) {
      const timedOut = error.name === "AbortError";
      sendJson(response, timedOut ? 504 : 502, {
        error: { message: timedOut ? "The AI request timed out. Please try again." : "Could not reach the AI service." },
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function createAppServer({ rootDir = root, apiKey = process.env.GROQ_API_KEY, fetchImpl = fetch } = {}) {
  const requestMetrics = new Map();
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    const metricRoute = ["/", "/index.html", "/api/health", "/api/chat/completions", "/metrics"].includes(pathname)
      ? pathname === "/index.html"
        ? "/"
        : pathname
      : "/other";
    const startedAt = process.hrtime.bigint();
    response.once("finish", () => {
      const duration = Number(process.hrtime.bigint() - startedAt) / 1e9;
      recordRequest(requestMetrics, request.method, metricRoute, response.statusCode, duration);
    });

    if (pathname === "/metrics" && request.method === "GET") {
      response.writeHead(200, {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(renderMetrics(requestMetrics, Boolean(apiKey)));
      return;
    }

    if (pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, { ok: true, aiConfigured: Boolean(apiKey) });
      return;
    }

    if (pathname === "/api/chat/completions" && request.method === "POST") {
      await proxyCompletion(request, response, { apiKey, fetchImpl });
      return;
    }

    if ((pathname === "/" || pathname === "/index.html") && ["GET", "HEAD"].includes(request.method)) {
      try {
        const html = await readFile(join(rootDir, "index.html"));
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        });
        response.end(request.method === "HEAD" ? undefined : html);
      } catch {
        sendJson(response, 500, { error: { message: "Could not load the app page." } });
      }
      return;
    }

    sendJson(response, 404, { error: { message: "Not found." } });
  });
}

async function startServer() {
  await loadLocalEnv();
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || "127.0.0.1";
  const server = createAppServer({ rootDir: root, apiKey: process.env.GROQ_API_KEY });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Stop the existing server or set a different PORT in .env.`);
    } else {
      console.error("The server could not start.", error);
    }
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`Outfit Roulette is running at http://${host}:${port}`);
    if (!process.env.GROQ_API_KEY) console.log("AI is not configured; add GROQ_API_KEY to .env and restart.");
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await startServer();
}