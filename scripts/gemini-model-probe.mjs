/** Bounded read-only diagnostics. Prints public model data and sanitized responses only. */
const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
if (!key) {
  console.log("SKIPPED: Gemini key is not configured locally.");
  process.exit(2);
}
if (process.env.EARMARK_ENABLE_TESTNET_EXECUTION !== "false") {
  console.log("REFUSED: financial execution must be explicitly disabled.");
  process.exit(1);
}
if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
  console.log("REFUSED: invalid model identifier.");
  process.exit(1);
}
const started = Date.now();
const generation = process.argv.includes("--generate");
const listing = process.argv.includes("--list");
const sanitize = (value) =>
  String(value ?? "")
    .split(key)
    .join("[REDACTED]")
    .replace(/AIza[\w-]+/g, "[REDACTED]")
    .replace(/([?&](?:key|api_key)=)[^\s&]+/gi, "$1[REDACTED]")
    .slice(0, 600);
const summary = {
  model,
  action: listing ? "models" : generation ? "generateContent" : "metadata",
  timeoutMs: generation ? 30000 : 15000,
  financialExecution: false,
  proxyEnvironmentPresent: [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NODE_USE_ENV_PROXY",
  ].some((name) => Boolean(process.env[name])),
};
try {
  const path = listing
    ? "models?pageSize=100"
    : `models/${encodeURIComponent(model)}${generation ? ":generateContent" : ""}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${path}`,
    {
      method: generation ? "POST" : "GET",
      headers: {
        "x-goog-api-key": key,
        ...(generation ? { "Content-Type": "application/json" } : {}),
      },
      body: generation
        ? JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: "Reply with just READY." }] },
            ],
            generationConfig: {
              maxOutputTokens: 512,
              thinkingConfig: { thinkingLevel: "low" },
            },
          })
        : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(summary.timeoutMs),
    },
  );
  summary.status = response.status;
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error("RESPONSE_TOO_LARGE");
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = {};
  }
  if (!response.ok) {
    summary.errorStatus = sanitize(payload.error?.status);
    summary.errorCode = payload.error?.code;
    summary.errorMessage = sanitize(
      payload.error?.message || "Non-JSON error response",
    );
    summary.errorDetailTypes = (payload.error?.details ?? []).map((detail) =>
      sanitize(detail["@type"]),
    );
  } else if (listing) {
    summary.models = (payload.models ?? [])
      .filter(
        (entry) =>
          /flash/.test(entry.name) &&
          entry.supportedGenerationMethods?.includes("generateContent"),
      )
      .map((entry) => ({
        name: entry.name,
        outputTokenLimit: entry.outputTokenLimit,
      }));
    summary.hasMorePages = Boolean(payload.nextPageToken);
  } else if (generation) {
    summary.finishReason = payload.candidates?.[0]?.finishReason;
    summary.text = sanitize(
      (payload.candidates?.[0]?.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join(""),
    );
    summary.usage = payload.usageMetadata;
    summary.validText = Boolean(summary.text);
  } else {
    summary.model = payload.name;
    summary.supportsGenerateContent =
      payload.supportedGenerationMethods?.includes("generateContent") === true;
  }
  summary.elapsedMs = Date.now() - started;
  console.log(JSON.stringify(summary, null, 2));
  if (!response.ok || (generation && !summary.validText)) process.exit(1);
} catch (error) {
  summary.error = sanitize(error?.name);
  summary.errorMessage = sanitize(error?.message);
  summary.transportCode = sanitize(error?.cause?.code);
  summary.elapsedMs = Date.now() - started;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(1);
}
