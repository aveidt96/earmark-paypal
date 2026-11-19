import assert from "node:assert/strict";
import { test } from "node:test";
import { runTrial } from "./tavily-research-trial.mjs";

const config = {
  name: "ai",
  tavilyKey: "fixture-tavily-token",
  geminiKey: "fixture-gemini-token",
  model: "gemini-3.8-flash",
};
const official = "https://provider.example/pricing";
const noise = "https://irrelevant.example/funding";
const results = {
  answer: "must not reach Gemini",
  results: [
    {
      url: official,
      title: "Model pricing",
      score: 0.91,
      content:
        "Official price evidence\n\n" + "Product documentation. ".repeat(80),
    },
    { url: noise, title: "Noise", score: 0.3, content: "Low ranking result" },
  ],
};
const call = (name, args, id) => ({
  role: "model",
  parts: [
    {
      text: "private reasoning",
      thought: true,
      thoughtSignature: `opaque-${id}-reason`,
    },
    { functionCall: { name, args, id }, thoughtSignature: `opaque-${id}-call` },
  ],
});

function fixture(turns) {
  const requests = [];
  let turn = 0;
  return {
    requests,
    fetcher: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url, body });
      assert.equal(init.redirect, "error");
      if (url === "https://api.tavily.com/search") {
        assert.equal(init.headers.authorization, `Bearer ${config.tavilyKey}`);
        assert.equal(init.headers["x-goog-api-key"], undefined);
        return Response.json(results);
      }
      if (url === "https://api.tavily.com/extract") {
        assert.deepEqual(body.urls, [official]);
        return Response.json({
          results: [
            {
              url: official,
              raw_content: "# Pricing\n\nCurrent tier details.",
            },
            { url: noise, raw_content: "unsolicited" },
          ],
        });
      }
      assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//);
      assert.equal(init.headers["x-goog-api-key"], config.geminiKey);
      assert.equal(init.headers.authorization, undefined);
      assert.doesNotMatch(
        init.body,
        /must not reach Gemini|fixture-(?:gemini|tavily)-token/,
      );
      const content = turns[turn++] ?? {
        role: "model",
        parts: [
          {
            text: "Prior pricing conflicted with the current rate card. Budget fit is unknown.",
          },
        ],
      };
      return Response.json({ candidates: [{ content }] });
    },
  };
}

test("deep trial performs distinct searches, filters by relevance, extracts and preserves exact Gemini tool turns", async () => {
  const turns = [
    call(
      "web_search",
      { query: "Chinese model developers official pricing" },
      "1",
    ),
    call(
      "web_search",
      { query: "Chinese model subscription billing terms 20 USD" },
      "2",
    ),
    call("extract_pages", { urls: [official] }, "3"),
    call(
      "web_search",
      { query: "Chinese model API current rate cards and prepaid terms" },
      "4",
    ),
  ];
  const { fetcher, requests } = fixture(turns);
  const outcome = await runTrial({ ...config, mode: "deep", fetcher });
  assert.equal(outcome.retrieval.length, 4);
  assert.match(outcome.answer, /conflicted/);
  assert.deepEqual(
    outcome.sources.map(({ url }) => url),
    [official],
  );
  assert.equal(outcome.retrieval[0].retained[0].score, 0.91);
  assert.ok(outcome.retrieval[0].retained[0].characters > 600);
  const searches = requests.filter(({ url }) => url.endsWith("/search"));
  assert.deepEqual(
    searches.map(({ body }) => body.query),
    turns
      .filter((turn) => turn.parts[1].functionCall.name === "web_search")
      .map((turn) => turn.parts[1].functionCall.args.query),
  );
  assert.ok(
    searches.every(
      ({ body }) =>
        body.search_depth === "advanced" &&
        body.chunks_per_source === 3 &&
        body.include_answer === false,
    ),
  );
  const final = requests.at(-1).body;
  assert.equal(final.toolConfig.functionCallingConfig.mode, "NONE");
  assert.equal(final.generationConfig.thinkingConfig.thinkingLevel, "high");
  assert.deepEqual(
    final.contents.filter(({ role }) => role === "model"),
    turns,
  );
  assert.ok(
    final.contents.some(({ parts }) => parts[0].functionResponse?.id === "3"),
  );
  assert.match(JSON.stringify(final.contents), /Current tier details/);
  assert.doesNotMatch(
    JSON.stringify(final.contents),
    /Low ranking result|unsolicited/,
  );
});

test("baseline uses one basic search and short excerpts on the same model", async () => {
  const { fetcher, requests } = fixture([]);
  const outcome = await runTrial({
    ...config,
    name: "email",
    mode: "baseline",
    fetcher,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.search_depth, "basic");
  assert.equal(requests[0].body.include_answer, false);
  assert.equal(outcome.retrieval[0].retained[0].characters, 600);
  assert.equal(
    requests[1].body.generationConfig.thinkingConfig.thinkingLevel,
    "low",
  );
});

test("extract rejects URLs that were never retained", async () => {
  const { fetcher, requests } = fixture([
    call("web_search", { query: "official model pricing" }, "1"),
    call("web_search", { query: "official model plan currency" }, "2"),
    call("extract_pages", { urls: [noise] }, "3"),
  ]);
  await assert.rejects(
    runTrial({ ...config, mode: "deep", fetcher }),
    /TRIAL_EXTRACT_REJECTED/,
  );
  assert.ok(requests.every(({ url }) => !url.endsWith("/extract")));
});

test("a missing key blocks the trial before transport", async () => {
  const { fetcher, requests } = fixture([]);
  await assert.rejects(
    runTrial({ ...config, tavilyKey: "", mode: "deep", fetcher }),
    /TRIAL_REQUIRES/,
  );
  assert.equal(requests.length, 0);
});
