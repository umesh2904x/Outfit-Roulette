import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppServer } from "../server.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function withServer(options, run) {
  const server = createAppServer({ rootDir: projectRoot, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("serves the app with security headers", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(html, /Outfit Roulette/);
  });
});

test("reports whether an AI key is configured without exposing it", async () => {
  await withServer({ apiKey: "test-secret" }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await response.json(), { ok: true, aiConfigured: true });
    assert.doesNotMatch(response.headers.get("content-type"), /text\/html/);
  });

  await withServer({ apiKey: "" }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await response.json(), { ok: true, aiConfigured: false });
  });
});

test("exports bounded Prometheus HTTP metrics and process gauges", async () => {
  await withServer({ apiKey: "test-secret" }, async (baseUrl) => {
    await fetch(`${baseUrl}/api/health`);
    await fetch(`${baseUrl}/missing`);
    const response = await fetch(`${baseUrl}/metrics`);
    const metrics = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain; version=0\.0\.4/);
    assert.match(metrics, /outfit_roulette_http_requests_total\{method="GET",route="\/api\/health",status="200"\} 1/);
    assert.match(metrics, /outfit_roulette_http_request_duration_seconds_bucket\{method="GET",route="\/api\/health",status="200",le="\+Inf"\} 1/);
    assert.match(metrics, /outfit_roulette_http_requests_total\{method="GET",route="\/other",status="404"\} 1/);
    assert.match(metrics, /outfit_roulette_ai_configured 1/);
    assert.match(metrics, /outfit_roulette_process_resident_memory_bytes/);
  });
});

test("returns a helpful response when AI is not configured", async () => {
  await withServer({ apiKey: "" }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "test" }] }),
    });

    assert.equal(response.status, 503);
    assert.match((await response.json()).error.message, /GROQ_API_KEY/);
  });
});

test("rejects unsupported models and malformed requests", async () => {
  await withServer({ apiKey: "test-secret" }, async (baseUrl) => {
    const unsupported = await fetch(`${baseUrl}/api/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "unapproved-model", messages: [{ role: "user", content: "test" }] }),
    });
    assert.equal(unsupported.status, 400);

    const malformed = await fetch(`${baseUrl}/api/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid json",
    });
    assert.equal(malformed.status, 400);
  });
});

test("proxies approved requests using the private key", async () => {
  let upstreamRequest;
  const fetchImpl = async (url, options) => {
    upstreamRequest = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await withServer({ apiKey: "test-secret", fetchImpl }, async (baseUrl) => {
    const requestBody = {
      model: "openai/gpt-oss-120b",
      max_tokens: 32,
      temperature: 0,
      messages: [{ role: "user", content: "Reply OK" }],
    };
    const response = await fetch(`${baseUrl}/api/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).choices[0].message.content, "OK");
    assert.equal(upstreamRequest.url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(upstreamRequest.options.headers.authorization, "Bearer test-secret");
    assert.deepEqual(JSON.parse(upstreamRequest.options.body), requestBody);
  });
});

test("returns JSON not found responses", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);
    assert.equal(response.status, 404);
    assert.match((await response.json()).error.message, /Not found/);
  });
});
