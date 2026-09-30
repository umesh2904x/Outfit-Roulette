import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const apiUrl = "https://api.groq.com/openai/v1/chat/completions";
const allowedModels = new Set(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
const maxBodyBytes = 15 * 1024 * 1024;

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

async function proxyCompletion(request, response) {
  if (!process.env.GROQ_API_KEY) {
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
    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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

await loadLocalEnv();
const port = Number(process.env.PORT || 4173);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, aiConfigured: Boolean(process.env.GROQ_API_KEY) });
    return;
  }

  if (pathname === "/api/chat/completions" && request.method === "POST") {
    await proxyCompletion(request, response);
    return;
  }

  if ((pathname === "/" || pathname === "/index.html") && ["GET", "HEAD"].includes(request.method)) {
    try {
      const html = await readFile(join(root, "index.html"));
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

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing server or set a different PORT in .env.`);
  } else {
    console.error("The server could not start.", error);
  }
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Outfit Roulette is running at http://127.0.0.1:${port}`);
  if (!process.env.GROQ_API_KEY) console.log("AI is not configured; add GROQ_API_KEY to .env and restart.");
});