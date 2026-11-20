# Earmark PayPal — active handoff and change log

Last updated: **2026-11-20**

This is the active handoff for Earmark PayPal. The inherited root `HANDOFF` file
contains original Monad project history. All future changes must be recorded
here, as required by the user and the root [AGENTS.md](AGENTS.md).

## Current project state

- **2026-11-20: Clean-slate hybrid search pipeline built on branch
  `gemini-fix`.** Replaced the 4,236-line snippet/Wikipedia search pipeline in
  `web/src/server/paypal/offer-discovery.ts` with a modular 3-stage engine under
  `web/src/server/paypal/search/` (Gemini native `google_search` grounding with
  automatic Brave Search fallback, SSRF-safe direct merchant pricing page fetch,
  and deterministic price/PayPal/budget verification) while preserving the
  existing UI, routes, quota, and PayPal/mandate boundaries. Live provider
  verification requires a replay with real keys.

- **2026-11-20: Additional merchant pricing excerpts prepared locally.**
  The existing Brave searches request more excerpts, and exact tier pricing
  can use a complete quote from any one bounded passage. DecodeError and
  BenchLM dated guides are rejected in offline fixtures. Production still
  needs a replay after publication.

- **2026-11-20: First-party offer research rebuild deployed at `4f46a37`.**
  The live replay found first-party pricing pages but classified them as
  unverified. It returned no comparable prices for the three benchmarks.

- **2026-11-19: Brave Search replaces Tavily in offer research.** The Gemini
  query planner still runs up to three bounded searches in parallel, using
  Brave for initial and follow-up retrieval. Configure the server-only
  `BRAVE_SEARCH_API_KEY` in the deployment environment. Tavily trial scripts
  remain available for offline development and separate provider experiments.
  Live search quality requires a Production replay.

- **2026-11-19: General regional candidate fallback refined for main.** When a
  country-scoped research request retrieves clean official pricing/docs pages
  without Wikipedia/Wikidata infobox corroboration, `discoverOffers` no longer
  drops alias/short-domain pages via `sourceHasProviderIdentity` or rejects
  pages that mention international deployment regions alongside the requested
  country; providers corroborated only in a non-requested country, resellers,
  aggregators, and explicit "official links" requests remain strictly rejected.

- **2026-11-19: General Gemini query planning and parallel Tavily retrieval
  merged to main (`8fc45dc`).** `discoverOffers` now plans 1–3 category-agnostic
  search queries via a bounded Gemini `planResearchQueries` turn (with automatic
  fallback to `buildOfferSearchQuery` on failure/timeout and an explicit
  `EARMARK_RESEARCH_QUERY_PLANNER=false` kill-switch), runs them in parallel
  through `createDiscoveryBoundary`, feeds up to 10 diverse sources to the
  collector, and emits sanitized `onPlan` / `onRetrievalSummary` diagnostics in
  `public-research.ts`. Live search quality still requires a Production replay.

- **2026-11-18: Exact short AI-plan request and verification fallback corrected
  locally.** Branch `fix/preserve-relevant-provider-links` starts at `ca6251e`.
  Short AI-plan wording retains its model intent. When country corroboration is
  incomplete, plausible provider pricing links can remain as clearly unverified
  research links. Production retrieval still needs a live replay.

- **2026-11-18: General provider discovery published on main.** Commit `ca6251e`
  passed the primary `earmark-paypal` check and failed the secondary
  `earmark-paypal-i2bk` check.
  The same relevance and first-party verification flow applies to products,
  subscriptions and APIs. Country of provider origin is optional and separate
  from the requested product and budget. Live retrieval remains unverified.

- **2026-11-18: China and US model-plan discovery published on main.** Commit
  `bf90406` passed the primary `earmark-paypal` Vercel check and failed the
  secondary `earmark-paypal-i2bk` check. Both exact AI prompts passed offline
  with constructed evidence. Their live result quality remains unverified.

- **2026-11-15: Incomplete-comparison relevance fix verified offline on latest
  fetched `origin/main` (`7457b75`, merged PR #3).** Local branch
  `fix/research-relevance-fallback` filters purchasing evidence before Gemini and
  in the server/client fallback; unrelated-only searches fail concisely. Published
  in [PR #4](https://github.com/aveidt96/earmark-paypal/pull/4). The user now
  authorizes publication to `main` for Production testing through the existing
  Vercel integration. Production runtime logs at 06:43 UTC
  remain inaccessible (HTTP 403); the live collector error is unconfirmed.

- **2026-11-15: PR #3 final-review corrections distinguish corroborated identity
  from unverified research links.** Sparse product docs and corporate aliases
  survive without self-asserted verification; request relevance is per product
  page with natural-language/alternative matching. Offline checks pass. Both
  Vercel projects are blocked by commit-author/team access; hosted builds and live
  relevance remain unverified. No merge or deployment is authorized.

- **2026-11-15: Draft-review branch `fix/official-provider-verification` targets
  `main` baseline `6182306`.** Carries the verified provider-identity/relevance
  fix and its offline regressions; publication is authorized as a draft PR only.
  No merge or Production deployment is authorized. Live relevance remains pending
  a separately authorized post-deployment check.

- **2026-11-15: Official-provider classification corrected locally in the Cloud
  checkout on `main` baseline `6182306`; offline checks pass, live relevance
  remains unverified.** Requires positive canonical brand, product relevance,
  model ownership and requested origin evidence; rejects unrelated/editorial/
  reseller sources in both provider discovery and collector offers. Independent
  valid links survive empty Gemini offers. This supersedes the earlier
  permissive provider-verification claim; no deployment or publication occurred.

- **Task: Official provider discovery fix verified locally in `.tools/task09-quota` (stacked on `origin/main` commit `4c6ed86`), 2026-11-14; ready for review before commit/push/deployment.**
  Separates first-class verified official provider website and documentation
  discovery (`officialProviders?: DiscoveredOfficialProvider[]`) from Gemini's
  structured offer pricing extraction (`offers`), excludes third-party
  aggregators/forums/blogs via `exclude_domains` (`TAVILY_EXCLUDED_DOMAINS` +
  `buildExcludedDomains`) and `buildOfferSearchQuery`, triggers a deadline-safe
  pre-Gemini `provider_search` step (`allowProviderSearch` /
  `allowProviderResults` / `clearProviderSearch`) when initial Tavily results lack
  official vendor domains or are crowded by listicles, rejects spoofed/comparison
  domains and checkout-only paths (`isSpoofedOrThirdPartyProvider`), renders
  verified research-only official links even when `offers` is `[]` or price
  validation fails, recognizes prepaid top-up/credit billing cleanly, and preserves
  all policy, PayPal safety, quota, and outbound guards. Root checkout remains
  untouched on `paypal-hackathon-primary-release` (`0945d04`).

- **Task: Official merchant pricing discovery fix verified locally in `.tools/task09-quota` (stacked on local commit `086209b`), 2026-11-13; published at `4c6ed86`.**
  Adds first-party hyphenated pricing path prioritization (`isOfficialPricingPath`),
  multi-token merchant-domain matching (`matchesMerchantDomain`, e.g.
  `Alibaba Model Studio` → `alibabacloud.com`), deadline-bounded targeted
  official-domain pricing search (`pricing_search` / `allowPricingSearch` /
  `buildTargetedPricingQuery`), server-side verification for usage-based per-token
  and prepaid-credit pricing (`verifyUsageOrCreditPricing` + `pricingDetails`)
  separated cleanly from fixed monthly/yearly subscriptions, and research-only
  official pricing documentation display without checkout or PayPal fabrication.

- **Task: Live public AI research reliability fix verified on `origin/main` (`b310a33`) in `.tools/task09-quota`, 2026-11-13; committed locally at `086209b`.**
  Adds bounded exponential backoff + equal jitter on primary comparison `503`s,
  recoverable failover to `GEMINI_COLLECTOR_FALLBACK_MODEL` (defaulting public
  research to `gemini-3.5-flash-lite` under the existing `55s` deadline and
  `reportDiscoveredOffers` boundary guards), official pricing/docs ranking, and
  categorized partial-search fallback UI separated from unknowns. Root checkout
  stays untouched on `paypal-hackathon-primary-release` (`0945d04`) with paused
  Task 10 Lambda WIP isolated.

- **Task 09D, 2026-11-11: offline recovery verified; publication authorized.**
  The direct-Vercel release preserves approved Norway composition. Hosted
  configuration/account verification and a genuine provider smoke remain.

- **Task 09C, 2026-11-10: approved Norway layout restored locally.**
  The ordinary checkout uses the original navigation, budget card, research
  chat and policy/activity rail. Judge simulation stays at `/judge`. Public
  research reports distinct configuration failures. Hosted provider execution
  is still unverified.

- **Task 09B, 2026-11-10: public research is the default in local code.**
  The public homepage and purchasing entry point open the live research
  composer directly. The deterministic Judge Sandbox and historical receipt
  are available at `/judge`. The reported Preview requires Vercel
  authentication, and hosted provider execution is unverified.

- **Task 09, 2026-11-10: implemented locally; hosted verification pending.**
  Norway has an opt-in anonymous real-offer workflow with a demo budget and
  review-only merchant links. The public Judge Sandbox remains deterministic.
  A fresh owner-only, loopback PayPal Sandbox campaign is wired separately.
  The deployed Preview was not changed; no purchase or capture was attempted.
  Saved-Wallet execution remains disabled.

- **Task 08D-R2 Git release, 2026-11-10: BLOCKED at GitHub authentication.**
  The staged gate passed and release commit `a29e5ac` exists on local branch
  `paypal-hackathon-release`. The single push attempt failed before publication.

- **Task 08D-R Git release, 2026-11-10: BLOCKED at the staged whitespace check.**
  The Judge formatting fix and public build passed. The release branch exists
  locally, with the reviewed paths staged and no new commit or push. The
  newly staged Task 04 report has trailing whitespace on lines 3 and 4.

- **Task 08D publication review, 2026-11-10: BLOCKED before publication.**
  The Vercel project lookup returned HTTP 403. The exact 138-file proposed
  delta is documented. Public build, boundary, secret, lint and type checks
  passed. One Judge handler formatting warning remains. No Git release or
  Preview was created.

- **Task 08C Monad isolation, 2026-11-10.** The public PayPal profile uses
  PayPal-only navigation and pages, gates legacy transaction routes, and
  excludes the legacy browser entry during compilation. The public build and
  Chromium smoke passed with zero external or legacy browser requests. The legacy workspace,
  wallet, Solidity/Foundry and deployment code remain available outside the
  public build. No new flag or dependency was added.

- **Task 08B deployment audit, 2026-11-10: READY WITH ACTIONS.** The public
  demo targets Vercel as one Next.js app and needs no external worker, Neon,
  or provider credentials. Private research stays authenticated on loopback.
  The operator must verify dashboard settings and separately authorize
  publication and deployment. Autonomous saved-Wallet payment stays disabled.

- **Task 08A demo polish, 2026-11-08.** Norway distinguishes controlled
  synthetic evaluation from live merchant research, presents source evidence
  in expandable sections, and makes manual approval's `not paid` state clear.
  Autonomous saved-PayPal-Wallet payments remain unresolved and disabled.

- **Task 07P-T2 live assisted checkout, 2026-11-08: PASS.** One authenticated
  Norway discovery rendered a real-offer card after two Tavily searches and
  one Gemini extraction. The cited Weatherstack pricing page opened over
  HTTPS. Manual approval showed `not paid` and issued zero mutation requests.
  Public Judge restrictions and deterministic policy passed. Zero PayPal or
  financial operations occurred.

- **Task 07P-T-FIX, 2026-11-08: offline diagnostics verified.** The retained
  07P-T trace cannot distinguish the exact Gemini rejection. Offline fixtures
  reproduce the same HTTP 409 for invalid native tool arguments and multiple
  native tool calls. Opt-in authenticated owner discovery now traces only the
  rejection stage and category locally. Validation and public behavior are
  unchanged. No additional live evaluation ran.

- **Task 07P-T live assisted checkout, 2026-11-08: PARTIAL.** One authenticated
  Norway submission reached Tavily and Gemini (both HTTP 200). The application
  returned `INVALID_MODEL_RESPONSE` before the merchant-specific payment search
  or any offer card. Live merchant navigation and manual approval remain
  unverified. The one authorized evaluation was consumed, with zero retries
  and zero financial operations.

- **Task 07P-SMOKE public preview, 2026-11-08: PASS.** The complete Chromium
  suite passed after updating the discovery button selector and the stale
  mock response. Assisted checkout is absent from public Judge research.
  Production UI and public restrictions were unchanged.

- **Task07P-S real-offer assisted checkout, 2026-11-07: verified offline.**
  Added a minimal session-only assisted manual checkout review flow to
  authenticated Norway owner chat (`!judgeSandbox && Boolean(csrf)`) on real
  discovered offer cards, while keeping synthetic offer flows and public Judge
  Sandbox unchanged. Provenance-checked HTTPS links open the official merchant
  page in a new tab; `"Approve for manual checkout"` and `"Reject"` record local
  session intent only (`not paid`, never `PAID`/`COMPLETED`), creating zero
  orders, mandates, intents, reservations or DB writes. 108 focused tests,
  offline Chromium UI checks, lint, typecheck, public demo build and secret
  scans pass.

- **Task07P-R tier-specific evidence & merchant payment search, 2026-11-07: verified offline.**
  Fixed the 07P-L3 AccuWeather Free/Starter availability defect by enforcing
  header-aligned tier-row matching, excluding overage/feature cells, withholding
  claims when row/column context is lost, and requiring explicit tier-bound
  availability evidence. Reordered discovery to `offer search -> Gemini
extraction -> targeted merchant payment-method search` within the existing
  2-Tavily / 1-Gemini budget while isolating payment evidence per merchant.
  106 focused tests, lint, typecheck, public demo build and boundary checks pass
  offline; zero live API, PayPal or DB activity.

- **Task07P-L3 live offer evidence verification, 2026-11-07: PARTIAL.**
  The revised searches retrieved first-party pricing and a named Starter
  tier. Norway rendered one AccuWeather card with price and PayPal unknown,
  no recommendation and no checkout eligibility. Its availability label was
  not supported by the tier evidence. No financial activity.

- **Task07P-Q offer evidence accuracy, 2026-11-07: verified offline.**
  The 07P-L2 billing changelog now yields PayPal `unknown`. Discovery favors
  named pricing tiers with explicit currency and billing, within the same
  provider-call budget. Both historical cards remain price-unknown.

- **Task07P-L2 live real-offer retest, 2026-11-07: PARTIAL.**
  The fixed Gemini envelope passed live. Norway showed two source-linked
  research cards. Neither had sufficient price and billing evidence for a
  recommendation. WeatherAPI's `not-listed` PayPal label overstates a generic
  billing reference. No PayPal calls or financial operations.

- **Task07P-FIX collector normalization, 2026-11-07: verified offline.**
  The reproduced whitespace mismatch is fixed. The strict Gemini guard and
  request builder now use the same canonical observations. Live extraction
  and Norway proposal rendering still need a separately authorized retest.

- **Task07P-L live real-offer verification, 2026-11-07: PARTIAL.**
  The authenticated Norway chat submitted once. Two Tavily searches returned
  HTTP 200. The app rejected the Gemini outbound envelope before dispatch,
  so no cards or offers were produced. A truncation/trim mismatch reproduces
  offline. No PayPal, financial or database activity.

- **Task07P real-offer proposals, 2026-11-07: implemented and checked offline.**
  Authenticated local chat can request Tavily/Gemini research. Comparison
  cards distinguish source-matched claims, unknowns and conflicting evidence,
  and can suggest a comparable offer for review. External merchants remain
  ineligible for Earmark checkout.

- **Task07N-G live Wallet identity diagnostic, 2026-11-07: PARTIAL.**
  Manual buyer consent, setup provenance and payer-ID matching passed. The
  exchange returned a different Vault customer ID and omitted the merchant
  reference echoed by setup and approval. The runner rejected the token and
  exited before checkout. No financial operations or database access.

- **Task07N-F Wallet identity binding, 2026-11-07: hardened offline.**
  The local runner now requires Earmark owner login, verifies setup provenance,
  and requires consistent merchant references, PayPal payer IDs and Vault
  customer IDs. The Sandbox mismatch and unattended payment remain unverified
  with these changes. No live calls were made.

- **Task07N-E Wallet identity review, 2026-11-07: provider clarification needed.**
  The token-only exchange is documented. PayPal illustrates equal Vault
  customer IDs and gives no universal equality guarantee or documented way
  to reconcile this mismatch. The fail-closed guard remains in place.

- **Wallet customer binding live diagnostic, 2026-11-07: mismatch reproduced.**
  Setup creation and approved lookup returned the same Vault customer ID.
  HTTP 200 exchange returned a different Vault customer ID. The runner stopped
  with no token retained locally, no database access and no payment. PayPal
  response timestamps and debug references are in an ignored local file.

- **Task07N-D-ID Wallet customer binding, 2026-11-07: verified offline.**
  The 07N-D-R failure compared the exchange against setup creation. The
  runner now requires a valid customer ID from the approved setup lookup and
  an exact match at exchange. The direct Wallet request shape is documented.
  The cause of the Sandbox response discrepancy remains unverified.

- **Task07N-D-R unattended $1 Sandbox purchase, 2026-11-07: PARTIAL.**
  PayPal confirmed manual consent and returned HTTP 200 with a Wallet token ID.
  The runner rejected it because the Vault customer IDs in setup creation
  and the exchange response differed. No mandate, order, capture or accounting
  writes. The one-shot authorization is consumed. Merchant-initiated checkout
  eligibility remains untested.

- **Task07N-D-FIX exchange diagnostics, 2026-11-07: verified offline.**
  HTTP 200 was already accepted; the exact prior predicate failure cannot be
  reconstructed. The local runner now records only status and validation flags.
  Fifteen fixtures passed; payer and customer binding checks remain enforced.

- **Task07N-D unattended $1 Sandbox purchase, 2026-11-07: PARTIAL.**
  Buyer consent was confirmed. The HTTP 200 token exchange response did not
  pass the local Wallet/customer binding checks, so the runner stopped before
  creating a mandate or sending an order. Four API requests, no retries or charge.
  Merchant-initiated checkout eligibility remains untested.

- **Task07N-C saved Wallet checkout, 2026-11-07: prepared offline.**
  Added an unrouted server-only one-purchase entry point with consent, payer,
  app/merchant and dedicated mandate checks. Reuses the Orders client and
  accounting; no new consent or live payment. The 07N-B token was discarded;
  merchant-initiated entitlement and actual checkout remain unverified.

- **Task07N-B fresh consent attempt, 2026-11-07: PASS.** Corrected local
  navigation opened PayPal Sandbox; the buyer approved. The setup POST was
  HTTP 201, approval lookup HTTP 200 / `APPROVED`, and the single exchange
  HTTP 201. A Wallet payment token was issued and discarded from local memory.
  Zero charges; reference-transaction eligibility remains unverified.

- **Task07N-B-FIX consent navigation, 2026-11-07: verified offline.** The
  recovered loopback runner serves `Referrer-Policy: same-origin` so Chromium
  submits the valid local Origin without forwarding a Referer to PayPal.
  Continue/cancel, expiry, and access controls passed offline. Ready for a
  separately authorized fresh consent attempt; no live API calls or exchange.

- **Task07N-B Wallet consent, 2026-11-07: PARTIAL.** One fresh setup POST
  returned HTTP 201 / `PAYER_ACTION_REQUIRED`. The local Continue button hit
  an Origin/referrer-policy mismatch before redirect; the local window expired
  without buyer consent or token exchange. No payment token or charge.

- **Task07N-A Wallet Vaulting setup, 2026-11-07: PASS for initiation only.**
  The existing US Sandbox app/seller binding matched. One setup-token POST
  returned HTTP 201, `PAYER_ACTION_REQUIRED`, and a Sandbox `approve` link.
  No buyer approval, token exchange, or charge; reference transactions and
  unattended payment remain unverified.

- **Task07N unattended Sandbox purchase, 2026-11-07: gated on account eligibility.**
  PayPal supports merchant-scoped saved Wallet payments after initial buyer
  consent, but the existing US Sandbox record confirms seller identity only.
  Vault enablement and billing-agreement/reference-transaction entitlement are
  unverified for that exact app/account. No unattended code path or mandate was
  added; buyer approval remains mandatory for the existing checkout.

- **Task07M targeted PayPal acceptance research (offline),2026-11-05:** extended
  Earmark's Tavily + Gemini offer discovery (`web/src/server/paypal/offer-discovery.ts`)
  to run a targeted second Tavily basic search (`max_results: 3`,
  `buildTargetedPayPalQuery(merchantDomain)`) for a selected discovered
  merchant's supported payment methods (prioritizing official FAQ, billing
  documentation and checkout pages via `prioritizePaymentResults`). Extracted
  direct evidence and the official source URL (`paypalSourceUrl`) and added
  deterministic server-side classification (`classifyPayPalEvidence`) across
  three states: explicitly confirmed on an official merchant page
  (`paypal: "claimed"`), PayPal not mentioned in published payment methods on an
  official merchant page (`paypal: "not-listed"`, including credit-card-only
  FAQs), and insufficient evidence (`paypal: "unknown"`, including PayPal
  branding on unrelated third-party sites). Updated Norway research cards
  (`web/src/components/offer-discovery.tsx`) to show the explicit 3-state status,
  supporting evidence and clickable `Official payment source` link while keeping
  all external merchants unapproved (`eligible: false`,
  `canonicalVerdict: "UNAPPROVED_MERCHANT"`).81 focused web tests (`4` files,
  including `26/26` in `web/test/offer-discovery.test.ts`), full typecheck,
  4-file Biome lint, `@flint/web` production build,54-chunk browser boundary
  scan and secret scan pass. Zero live API, PayPal or DB operations.

- **Task07L-R live Tavily + Gemini discovery verification,2026-11-05: PASS.**
  Submitted the exact user-supplied monthly $10 weather/PayPal research
  instruction once through the authenticated Norway Judge Sandbox UI (`1`
  Tavily Search request + `1` Gemini collector request total, zero retries).
  Tavily `POST https://api.tavily.com/search` (`search_depth: "basic"`,
  `max_results: 5`, `418` bytes) returned HTTP `200` (`4352ms` headers /
  `4469ms` body, `5` public `https://` results). Sanitized results passed
  `boundary.allowCollector` into Gemini `models/gemini-3.5-flash-lite:generateContent`
  (`6836` bytes, HTTP `200`, `37301ms` headers / `37321ms` body, `finishReason:
"STOP"`, `reportDiscoveredOffers` called once, `strictSchemaValid: true`).
  Collected `Weatherstack · Standard API Plan (up to 50,000 requests)` at
  `999` minor units (`$9.99 USD`, `Monthly` claim) with cited URL
  `https://weatherstack.com/pricing` (`cited: true`), `slaMinutes: null`
  (`unknown`), and `paypal: "unknown"` (`paypalEvidence: null`). Independent
  policy (`authorize` / `policyFor`) rejected purchasing (`eligible: false`,
  `canonicalVerdict: "UNAPPROVED_MERCHANT"`, reasons:
  `EXTERNAL_MERCHANT_NOT_BOUND`, `IMMUTABLE_TERMS_UNVERIFIED`,
  `HUMAN_AUTHORIZATION_REQUIRED`, `TRANSACTION_LIMIT_EXCEEDED`,
  `DELIVERY_SLA_UNKNOWN`, `PAYPAL_ACCEPTANCE_UNVERIFIED`). Norway UI rendered
  the research card, citation link, `UNKNOWN` labels and disabled payment
  button with `0` browser runtime errors (`.tools/task07lr-chat-redacted.png`).
  Public policy-only restrictions restored and verified (`policy` `200`,
  `discovery` `403`, `owner chat` `403`); temporary servers stopped. Zero
  PayPal, database or application-source changes.

- **Task07L Tavily Search integration (offline),2026-11-05:** replaced Gemini
  Google Search grounding in `web/src/server/paypal/offer-discovery.ts` with
  Tavily's Search API (`POST https://api.tavily.com/search`, `search_depth:
"basic"`, `max_results: 5`, `Authorization: Bearer <TAVILY_API_KEY>`).
  Sanitized Tavily results (`title`, validated `https://` `url`, `snippet`,
  `retrievedAt`) pass through `boundary.allowCollector` (enforcing schema,
  sensitive-material and prompt-injection checks) into the existing Gemini
  `reportDiscoveredOffers` collector (`GEMINI_MODEL`, `maxOutputTokens: 3000`,
  `thinkingLevel: "low"`, no `googleSearch`) and independent `policyFor`
  workflow. Purchasing-agent model, Norway research cards, source citations,
  `UNKNOWN` labels, loopback auth/CSRF/hosted denial and financial restrictions
  are preserved.158 focused offline tests (`7` files, including `25/25` in
  `web/test/offer-discovery.test.ts`), full typecheck,10-file Biome lint,
  `@flint/web` production build,54-chunk browser boundary scan and secret scan
  pass. Zero live API, PayPal or DB operations. Ready for one separately
  authorized live Tavily + Gemini evaluation once `TAVILY_API_KEY` is populated
  in `web/.env.local`.

- **Task07K-R live discovery attempt,2026-11-05: FAIL (`404 NOT_FOUND` on
  `models/gemini-2.5-flash`).** Rebuilt `@flint/web` with
  `NEXT_PUBLIC_DEMO_ONLY=true` (`54/54` browser boundary chunks clean) and
  submitted the exact user-supplied monthly $10 weather/PayPal research
  instruction once through the authenticated Norway Judge Sandbox UI. Turn 1
  sent `1` Google HTTP request (`1374` bytes) to
  `models/gemini-2.5-flash:generateContent` with `tools: [{ googleSearch: {} }]`
  only; Google returned HTTP `404` (`NOT_FOUND`, `775ms` headers / `817ms` body,
  `1044ms` application roundtrip) stating `"This model models/gemini-2.5-flash is
no longer available to new users. Please update your code to use
models/gemini-3.8-flash for the latest features and improvements."` Turn 2
  (`gemini-3.5-flash-lite` collector) was not called (`1` Google API request
  total, zero retries). Application returned HTTP `400` (`MODEL_API_ERROR`);
  Norway UI showed the alert with zero browser runtime errors and no fabricated
  offers/cards/proposals. Public policy-only restrictions restored and verified
  (`policy` `200`, `discovery` `403`, `owner chat` `403`); temporary servers
  stopped. Zero PayPal, database or application-source changes.

- **Task07K-FIX offline search-model split,2026-11-05:** configured the existing
  research path (`web/src/server/paypal/offer-discovery.ts`) to run a separate
  search-only Turn 1 on `gemini-2.5-flash` (`tools: [{ googleSearch: {} }]`,
  `thinkingBudget: 0`, `maxOutputTokens: 3000`) and pass schema-validated
  `searchFindings`, `groundedSources` and `webSearchQueries` into Turn 2's
  existing `reportDiscoveredOffers` collector on `GEMINI_MODEL`
  (`gemini-3.5-flash-lite` in `web/.env.local`; default `gemini-3.8-flash`)
  without combining `googleSearch` and `functionDeclarations` in one request.
  Purchasing-agent model, Norway research cards, source citations, uncertainty
  labels, privacy/outbound guards, approved-merchant rules and financial
  restrictions are unchanged.156 focused offline tests (`7` files), full
  typecheck, scoped Biome lint, `@flint/web` production build,54-chunk browser
  boundary scan and secret scan pass. Zero live Gemini, PayPal or DB operations.
  Ready for one separately authorized live test (with a fresh one-use harness
  allowing the2-turn `gemini-2.5-flash` -> `GEMINI_MODEL` sequence).

- **Task07K live discovery attempt,2026-11-04: FAIL (provider quota).** One
  authenticated Norway submission and one real Google HTTP request returned429
  RESOURCE_EXHAUSTED (~793ms body,981ms application roundtrip). Zero returned
  candidates/tool calls/grounding; no offer or policy result fabricated. No retry.
  Public policy-only restrictions restored/verified; temporary servers closed.
  No application-code/config-file, financial or database changes. A further live
  attempt requires quota availability and new explicit authorization.

- **Task07J local implementation,2026-11-04:** authenticated loopback-only
  Google Search/native collector path and Norway research cards implemented;
  disabled by default, public access denied.197 offline tests, production build/
  typecheck, scoped lint,9-route/five-width browser smoke and credential scans
  pass. No live discovery verified or provider/payment/DB operation performed.
  All external merchants remain unapproved; no payable offer mapping exists.

- **Task07I interactive judge sandbox,2026-11-04:** Norway Judge sandbox accepts
  typed weather requests, runs real independent policy with a labeled mock
  planner and shows comparisons/rejections/approval requirements. No financial
  capability or persistent state. Separate loopback judge Gemini auth/session
  path is implemented and offline-tested; public live Gemini is hard-disabled
  pending distributed auth/quota/cost/abuse controls.133 targeted tests, final
  production build/typecheck,9-route/five-width browser smoke, local judge login
  preflight and54-chunk credential/client boundary scans pass. No real Gemini,
  PayPal or database operation. See docs/task-07i-judge-sandbox.md.

- **Task07H publication audit, 2026-11-04:** exact118-file publish inventory
  reviewed; local secrets/state/evidence remain ignored. Norway CSS31 selector-order
  and15 !important warnings corrected without changing lint rules. Scoped and
  repository-wide Biome plus Foundry formatting pass. Production build/typecheck,9-route/5-width
  browser smoke and8 Norway CSS comparison cases pass; zero style differences.
  Optional Classic computed-style extension timed out at local startup; existing
  Classic production smoke and screenshot review passed. Remote Vercel linkage,
  root/framework/Node/commands/environment and automatic-deployment settings remain
  unverified; no settings changed. See `docs/task-07h-publication-readiness.md`.
  No Git staging, commit, push, deployment, provider request or database operation.

- **Task07G local public demo PASS, 2026-11-03:** public visitor flow, synthetic
  comparison/proposal,4 deterministic policy scenarios, labeled historical receipt,
  navigation and Norway/Classic Light verified.58 targeted tests, production build
  with TypeScript/VERCEL=1,9-route/five-width browser smoke,16 direct access probes
  and credential/browser scans passed. Lint gate remains FAIL on46 existing CSS
  style warnings (29 informational notes); no app change justified. Git publication
  and deployment are on hold pending review/authorization and actual Vercel setting
  confirmation. New checklist: `docs/task-07g-public-demo-readiness.md`. Public
  preview3032, PID10524, build `NlpOWH-OSouO48j7T3nxi`. No live AI, provider payment
  operation or database access/write; project-flint status unchanged.

- **Task07F-R completed live Norway chat verification, 2026-11-03:** exactly
  one owner-authenticated chat submission completed in7153ms, six genuine Google
  HTTP200 responses/five native calls. Selected synthetic US Weather Prime
  Telemetry at400 USD minor units ($4),5-minute SLA, versus the eligible600-minor-
  unit/10-minute backup.10/10 independent policy checks passed; human approval
  required, ownerAuthorized=false, persisted=false, fundsReserved=false. Final
  synthetic-only outbound guard remained active for every request/continuation;
  exact instruction and credential exclusion checks passed. Fresh hashes match
  all8 PayPal tables and owner auth. Public preview restored on3032, PID5204,
  unchanged build; chat GET/POST403 and payments disabled. The single live
  authorization is now consumed; no further inference or payment is authorized.

- **Task07F-P preflight repaired and verified, 2026-11-03:** reproduced the
  owner-login-field visibility timeout before authentication. Waiting for the
  client-rendered policy proposal before clicking chat fixed the runner readiness
  race; no application change needed. Authenticated private chat/session200, CSRF
  present, empty input accessible; no instruction or Gemini request. Public preview
  restored on3032, PID972, unchanged build `GgYKS2Q13OibjBORMAz59`; public chat
  GET/POST and payment-test GET403, payments disabled. Original07F exception detail
  was lost; the reproduced failure and remaining timing uncertainty are below.

- **Task07F stopped before live inference, 2026-11-03:**31 offline chat/privacy
  tests and the exact-instruction final-guard interception passed. The private
  endpoint required authentication (401), but browser preflight failed before
  login or chat submission; no Gemini request was sent. The original browser
  exception detail was not retained, so its root cause is not established. All8
  PayPal table fingerprints and owner auth remain unchanged. Public read-only
  preview restored on3032, PID7216, unchanged production build; chat403 and
  payments disabled. Live verification was subsequently completed under Task07F-R.

- **Task07E Norway migration verified locally, 2026-11-03:** Norway replaces
  Airy as default, using the supplied desktop HTML's232px sidebar, bundled fonts,
  stone/ink palette, dark budget banner, white bordered cards and policy rail.
  Saved Airy/Dark/System migrate to Norway; Classic Light remains selectable and
  unchanged. Existing typed chat, independent policy, owner/checkout safeguards
  and historical records are preserved.89 targeted offline tests, typecheck,
  final production build, lint/formatting, credential scan and final9-route/five-
  viewport browser smoke passed. One cold load-event timeout did not reproduce
  on the running app (fully loaded in2.2s) or unchanged smoke retry; its precise
  cause remains undetermined and is logged below. Current read-only preview:
  `http://127.0.0.1:3032`, PID10524, build `NlpOWH-OSouO48j7T3nxi`
  (follow-up below removes the extra legacy panels).
  No live Gemini/PayPal operations, database writes, deployment or Git publication.

- **Task07B-FIX verified locally, 2026-11-02:** corrected the Chat/homepage
  composition against actual Figma frame3:2. Airy leads with the two-column
  purchasing introduction/budget and conversation/proposal; the legacy
  introduction/help controls are below the workspace, the duplicate outer console
  heading/frame is removed, and the read-only notice is compact. Classic Light
  retains its original order and appearance. Five viewport checks, browser smoke,
  25 theme/UI tests, production build/typecheck, lint and formatting passed.
  Latest read-only preview: `http://127.0.0.1:3032`, PID9096, build
  `C0rgksVkuz-sIx5M4GNDg` (supersedes earlier preview PIDs below).
  No Gemini/payment/policy/permission logic or financial records changed.

- **Task07C implemented offline, 2026-11-02:** Airy typed instructions now reach
  the existing native Gemini adapter through an owner/Host/Origin/CSRF-gated
  chat action. Only eligible approved synthetic offers and disposable test policy
  are used; the final outbound privacy guard remains mandatory. Results include
  comparison, explanation and independent policy proposal/rejection. No intent,
  approval or reservation is persisted. Policy demo and live chat are explicitly
  separate; mocked transport is visibly labeled. Production build, TypeScript,
  scoped lint/format, targeted regressions and desktop/mobile browser smoke pass.
  Local preview remains public-demo-only at `http://127.0.0.1:3032`, PID13448,
  build `bl_rH1nvM_CsSLQsEVsw6`; live chat returns403 and payments remain disabled.
  One live Gemini test still requires separate authorization and the existing
  authenticated local profile. No live Gemini, PayPal or database operations ran.

- **Task07B locally verified, 2026-11-02:** Design B Airy is the new default;
  Classic Light preserves the existing Light appearance and stored `light` value.
  Removed Dark/System options; legacy `dark`/`system` preferences migrate to
  `airy` without OS-dependent switching. Scoped shared Airy styles cover existing
  screens, with a responsive conversation and proposal presentation using the
  existing synthetic policy workflow. Free-form chat remains explicitly local
  draft-only. Final build/browser verification passed; 78 targeted tests passed.
  No live inference, payments, persistent financial changes or deployment.

- **Task06 investigative recheck, 2026-11-02:** the existing four scenarios
  are present in source; five targeted offline test files passed **63/63**.
  The existing preview smoke runner passed on its second attempt: eight routes,
  four recorded controls, four PayPal policy verdicts, receipt display, mobile
  layout and zero browser exceptions. Its first attempt failed with
  `PREVIEW_START_FAILED`; the cause was not established. Earlier build/deployment
  results below remain historical. PayPal invalid-delivery protection verifies offer-term
  commitments, not delivered payload bytes or delivery-conditional settlement.
  No implementation or financial record was changed in this investigation.

- **Task07 prepared (user-managed deployment handoff), 2026-11-01:** implemented
  and locally verified the public **DEMO-ONLY** lockdown
  (`NEXT_PUBLIC_DEMO_ONLY=true` / `EARMARK_PUBLIC_DEMO_ONLY=true`) disabling all
  payment execution, financial mutations, live Gemini inference, owner-test
  authentication forms, internal diagnostics, webhooks and background polling
  while preserving the read-only Task05J `$6.00 USD` PayPal Sandbox receipt
  (`6U113515L79775315` / `0V581522H50035631`) and all four security scenarios
  (`Demo Mode` and `PayPal Agent · Policy`) without private credentials. Created
  an isolated Vercel Hobby project `samuelid22/earmark-paypal`
  (`prj_3gx7TVFqc97WAUy2C2FoyEzot5yC`, Node `22.x`, root `web`, leaving legacy
  `earmark` untouched) with 12 non-secret `Config` flags and zero credentials/DB
  URLs; an initial CLI build (`dpl_5xE7WffghUgXFFkUWriMw488A3s5`) verified HTTP
  200 on `https://earmark-paypal.vercel.app` and HTTP 403/404 across all 15
  privileged endpoint probes, and a second CLI deployment watcher
  (`https://earmark-paypal-caz1n1bi6-samuelid22.vercel.app`) was cancelled when
  the user requested to perform the final deployment directly. End-to-end hosted
  browser verification remains pending after the user's final deploy.

- **Task06 verified, 2026-10-31:** verified and surfaced the four core security
  and judge demo scenarios (`A — Normal Purchase`, `B — Prompt Injection`,
  `C — Invalid Delivery`, `D — Budget Exhaustion`) across both the recorded
  Execution Console (`Demo Mode`) and the credential-free `PayPal Agent · Policy`
  simulator (`/` and `/security`), without any live Gemini request, PayPal API
  call or database mutation. Normal purchase displays the completed Task05J
  `$6.00 USD` PayPal Sandbox receipt (`6U113515L79775315` / `0V581522H50035631`,
  `COMPLETED`, `$10` authorized / `$6` consumed / `$0` reserved / `$4` available)
  read-only without replay, and locks Task05J/Task05C mandate IDs against reuse
  (`COMPLETED_MANDATE_REUSE_FORBIDDEN`). Deterministic policy scenarios `B` and
  `D` now submit their adversarial/over-remaining-budget proposals to
  `proposePurchase` and produce explicit `PROPOSAL REJECTED (UNAPPROVED_MERCHANT)`
  and `PROPOSAL REJECTED (BUDGET_EXHAUSTED)` verdicts with `0` reserved funds.
  Invalid delivery (`C`) demonstrates the actual implemented pre-proposal
  `keccak256` delivery-commitment verification (`INVALID_DELIVERY_COMMITMENT`),
  immutable SHA-256 term binding, human approval gate and post-capture binding,
  while explicitly documenting that PayPal immediate `CAPTURE` does not implement
  post-capture merchant payload inspection or onchain-style escrow refund.

- **Task05J COMPLETED, 2026-10-31T03:33:20.229Z:** exactly one capture POST201
  for order **6U113515L79775315**; capture **0V581522H50035631**, actual order
  and capture GETs independently verify COMPLETED,600USD, correct merchant/order.
  Fresh owner/session, exact-mandate execution guard, buyer separation, approval,
  expiry and policy checks passed; existing adapter reconciled APPROVED before
  capture. Neon attempt **b7914b21-a74f-4b68-b531-06b5cd4fcdc0** is SUCCEEDED /
  CONSUMED: authorized1000/reserved0/consumed600/available400. All historical
  fingerprints and prior target audit rows preserved. No new order/reservation/
  intent/campaign/Gemini request. Operator opt-in was ephemeral; public application
  controls stay disabled. Capture/order authority is spent; do not retry, replace,
  reuse this completed transaction or spend remaining400 without new authority.

- **Task05I verified, 2026-10-31T03:13:22.857Z:** fresh authenticated PayPal GET
  confirms order **6U113515L79775315 APPROVED**, matching600USD, approved merchant
  and reservation references, with zero captures. Campaign ACTIVE/unexpired to
  2026-11-01T01:38:09.179Z; reserved600/consumed0/available400. All eight complete
  table fingerprints and owner credentials unchanged. Local journal intentionally
  remains AWAITING_APPROVAL/PAYER_ACTION_REQUIRED because this was read-only,
  with no reconciliation. Eligible for a separately authorized capture subject
  to fresh policy/expiry/approval checks then; capture is not authorized now.

- **Task05H verified, 2026-10-31:** one scoped Orders POST created/returned
  Sandbox order **6U113515L79775315**, canonical status PAYER_ACTION_REQUIRED,
  local AWAITING_APPROVAL, against existing reservation
  **b7914b21-a74f-4b68-b531-06b5cd4fcdc0**. USD600 and approved merchant verified;
  actual OAuth/POST/canonical GET all HTTP200. Official buyer approval URL saved
  and returned for manual use, never opened/approved automatically. Fresh
  PostgreSQL checks confirm one creation claim, no extra reservation, unchanged
  intent/history and authorized1000/reserved600/consumed0/available400. Mandate
  remains ACTIVE/unexpired until2026-11-01T01:38:09.179Z. Zero captures/Gemini
  calls. This order-creation authority is spent; no retry/replacement/capture is
  authorized. Application remains payment-disabled; await manual buyer approval
  and separate capture authorization.

- **Task05G verified, 2026-10-31:** authenticated local owner approval and all10
  independent policy checks produced exactly one USD600 reservation/attempt
  **b7914b21-a74f-4b68-b531-06b5cd4fcdc0**, state/budgetState RESERVED,
  at2026-10-31T02:13:50.996Z, using existing intent/purchase key. Fresh independent
  PostgreSQL reads confirm authorized1000/reserved600/consumed0/available400,
  ACTIVE/unexpired and unchanged expiry2026-11-01T01:38:09.179Z. Original intent
  and historical fingerprints are unchanged. Zero Gemini or PayPal operations;
  financial execution remains disabled. Next separate authorization: create one
  Sandbox order against this reservation, with no new reservation or capture.

- **Task05F verified, 2026-10-31:** existing agent-05d-v1 selected and exactly
  one owner/CSRF-gated evaluation completed in12142ms, six Google HTTP200s and
  five valid native tools. Strict synthetic USD600 proposal passed all10 independent
  policy checks; application returned PREPARED intent
  **4d59c38f-5632-54bd-98ee-d5b4d9d95eab**, HUMAN_AUTHORIZATION_REQUIRED,
  ownerAuthorized=false/fundsReserved=false. Mandatory final synthetic transport
  guard and canaries gate every dispatch; offline guard preflight and43 mocked
  tests passed. Available1000/reserved0/consumed0, no payment operation. Local
  app now runs agent-05d-v1 at127.0.0.1:3032, verified PID16860; execution disabled.
  Fresh independent PostgreSQL verification confirms exactly one intent, zero
  attempts, unchanged expiry/terms/accounting and preserved historical records.

- **Task05E created and verified, 2026-10-31:** exactly one fresh agent-05d-v1
  campaign **1bb93841-8f90-59a8-abd0-c24ffe4a4c16**, mandate
  **a355d338-3531-58e6-a57f-9b6b88219ca0**, was atomically persisted through the
  existing authenticated repository method. Created **2026-10-31T01:38:09.179Z**;
  expires **2026-11-01T01:38:09.179Z** (02:38:09.179 Lagos on each date).
  ACTIVE/unexpired, USD cap1000/available1000/reserved0/consumed0, transaction
  ceiling600; existing owner/agent and approved US Sandbox merchant verified.
  At creation there was no intent/attempt, Gemini request or PayPal operation;
  execution disabled. Historical table fingerprints and owner credentials matched.
  The launcher/UI still selected expired agent-05c-v1 during Task05E. Task05F
  separately authorized profile selection, evaluation and non-financial intent;
  financial execution remains unauthorized. See the dated logs for verification.

- **Task05D-S verified, 2026-10-30:** production build passed; local agent runs
  as owned **PID9532** at **http://127.0.0.1:3032/agent-checkout**, exactly one
  loopback listener and current build ID. Authenticated read-only browser smoke
  passed with zero page errors; updated UI, expired mandate, disabled authorization
  and unavailable approval/capture controls verified. Seven existing mocked
  safeguard tests passed. Pre/post TLS table/auth fingerprints match, accounting
  remains cap1000/reserved0/consumed0/available1000. No live model/payment request
  or persistent mutation in that session. Task05E subsequently created fresh
  agent-05d-v1 authority; profile selection and execution remain future work.
  The expired agent-05c-v1 stays preserved.

- **Task05D implemented offline:** owner-only intent → policy → fresh campaign
  checkout → human buyer approval → capture/reconciliation → accounting is wired
  through existing services. Execution is off by default, scoped only to future
  agent-05d-v1 authority, and unavailable to Gemini tools. Final targeted tests
  passed211/211 across12 suites; web types, changed-file lint/format and credential
  checks passed. Fresh read-only table/auth fingerprints match. No persistent
  campaign/intent, financial or provider mutation. Task05D-S has now verified the production build, reload and read-only browser UI.
  Separately authorized fresh authority/live work remains prerequisite to a real
  Sandbox checkout. See the dated log.

- **Task05C-V completed, 2026-10-30:** exactly one live synthetic evaluation
  succeeded in6738ms: six HTTP200 responses, five valid native calls, strict
  finish and a600-minor-unit USD proposal; all10 policy checks passed. Runtime
  final guard accepted6 requests, validated15 cumulative tool responses and
  rejected33 local canaries. No timeout/retry or persistent result. Before/after
  PostgreSQL fingerprints and owner auth match; the expired campaign and its one
  intent are unchanged, cap1000/reserved0/consumed0/available1000. This live
  authorization is now consumed; no additional evaluation or payment is authorized.

- **Application:** Earmark PayPal, an independent adaptation for the PayPal AI
  Hackathon. Original Earmark presentation and authorization infrastructure are
  preserved, with explicit PayPal preparation / legacy EVM labels.
- **Working directory:**
  `C:\Users\USER\Documents\project-prometheus\project-earmarkpaypal`.
- **Destination remote:** `https://github.com/aveidt96/earmark-paypal.git`.
- **Git:** local `main` and locally stored `origin/main` point at `723662b`
  (checkpoint through Task03G). Task04/Task05A/Task05B/Task05C/Task05C-S/Task05C-T/Task05C-U working changes are uncommitted. No remote fetch,
  publication or deployment was performed in this session.
- **Original source:** sibling `../project-flint`, remote
  `https://github.com/aveidt96/Flint.git`, commit
  `cc20daa06392c588a42925d3844311abac1a067f`.
- **Source integrity:** October29 Task05C-T verification matched original HEAD,
  refs, working status, diff and 305 file hashes, including ignored environment
  files and pre-existing user changes. Do not modify that repository.
- **PayPal:** Sandbox-only foundation retains policy/reservations, OAuth/Orders,
  approval-gated capture, strict webhook verification and recovery. US profile is
  running at `http://127.0.0.1:3031/paypal-test`; Task03E/03G exact one-shot
  permissions are **spent**. Actual order **72936380818559054** and capture
  **52C23729CU714125M** are authoritatively **COMPLETED**, USD6.00, matching US
  seller/order/attempt terms. Exactly one capture POST/claim and one consumption
  verified. No further payment is authorized; ordinary payment flags remain false.
  No buyer approval was automated. Original order **9N317079B4816951W** is unresolved;
  its last original-credential GET was 404, not non-capture evidence. Original
  credentials are not locally configured for investigation; US credentials are
  rejected by original-order tooling. Webhook ID remains absent (no fake).
- **Human handoff:** Task03G succeeded: inspect the receipt through authenticated
  local UI or read-only `paypal:us:status` / `paypal:us:capture:verify`. Do not rerun
  execute, reapprove, create replacements, reset journals or spend the remaining
  $4 without a new explicit authorization. The exact capture permission is spent
  durably across restart; capture replay returns only the saved successful result.
  Resolve the old obligation separately. Preserve owner/both campaigns, do not
  reset expired authority or release reservations from 404. Current receipt/checks:
  `docs/task-03g-capture-report.md`. Earlier Task03E/03F
  preparation/approval results remain historical.
- **Deployment:** none performed for this repository. The Render blueprint has
  automatic deployment disabled.
- **Agent preparation (Task05C-V live synthetic evaluation verified):** local
  **http://127.0.0.1:3032/agent-checkout** is running as verified owned **PID9532**,
  with the Task05D-S build and runtime **task05ct-transport-v1**. Earlier owned
  PID7404 had already exited; only one replacement was started for Task05D-S. Gemini now defaults to
  **60000ms per model turn**, with explicit overrides and the existing cap intact.
  Current configured model is `gemini-3.5-flash-lite`; no live request was made
  during Task05C-U. Cancellation/privacy/strict policy remain enforced. Targeted
  tests112 passed, corrected boundary20 passed, agent/web types, changed-file lint
  and the affected production build passed. No full-suite rerun was needed.
  The earlier October29 PID17164 is historical. The launcher confirmed a free port
  before starting its replacement. Only the verified old PID2360 was previously stopped.
  Owner credentials remain preserved;
  epoch rotation requires re-login. The existing campaign **556bce55-e74a-567f-8516-a80553b52c57**,
  version **agent-05c-v1**, mandate **065af6d7-98d7-5262-a6a1-7fb33c2a1ddc**,
  remains the only new campaign, with one non-financial pending intent
  **570086fa-b2ae-5b50-85a2-107e2446ddc7**. Fresh PostgreSQL checks verified
  cap1000/reserved0/consumed0/available1000, no attempts and immutable expiry
  **2026-10-29T19:15:34.339Z** (20:15:34.339 Lagos). It was unexpired during the
  October29 verification and is now **expired**; do not extend, bypass or reuse it.
  The old agent05a journal remains **FAILED / INVALID_MODEL_RESPONSE** and its
  immutable 2026-10-28 expiry is now past. Never reset, resume or extend it.
  Task05C's historical live run disclosed Sandbox payment metadata via a shared
  status tool; evidence remains append-only and locally restricted. The new
  final transport policy strictly validates complete synthetic requests, all
  tool turns, authentic native IDs/signatures and every retry. A policy is
  mandatory in every profile; production legacy live EVM sessions are disabled
  until they have an approved outbound policy. Historical read-only views remain.
  Task05C-S's one Google dispatch ended **MODEL_TIMEOUT**, with no retained HTTP
  phase. Task05C-T's separately authorized one evaluation also timed out after
  exactly one dispatch: connection557ms, headers sent574ms, no response headers
  before local abort15028ms. Real final guard accepted1/rejected0/canaryRejected3;
  offline complete conversation accepted6, validated15 cumulative tool responses,
  rejected33 canaries and passed10 policy checks. **Live response/authentication/
  continuation was unverified at Task05C-T.** Task05C-V now verifies a complete
  synthetic-only live continuation; its one-use authorization is consumed.
  Task05C-T fixed repeated response cloning/HTTP-error-body masking and confirmed
  a missing PostgreSQL server deadline: named startup parameter was ineffective0;
  startup options now enforce the intended10000ms, without increasing client
  deadlines. Pre-DB-fix combined tests passed841 with six skips; final-source
  isolated capture passed2/2 with effective10000ms and clean pool/schema cleanup.
  October29 final full runs passed842 tests each at default and single-worker parallelism,
  six opt-in skips each, all20 PayPal DB cases enabled. One intermediate build-mismatch setup
  failure is explicitly logged; historical PG/security-demo causes remain uncertain.
  All payments remain disabled; no new campaign, intent or financial row was
  created. See **docs/task-05c-timeout-stability-report.md** and the earlier
  **docs/task-05c-security-verification.md** for evidence and limits.

- **Database:** `database/paypal/001_sandbox.sql` defines an isolated
  `earmark_paypal` schema; Task 03A applied its exact approved version and verified
  all actual objects plus eight real PostgreSQL accounting/concurrency cases.
  Runtime uses the dedicated
  `PAYPAL_DATABASE_URL` and Sandbox binding, never legacy `DATABASE_URL*` fallback.
  Existing Monad tables/migrations are preserved. Do not run legacy `db:migrate`
  for PayPal. Client TLS, identity and absence of legacy objects are verified.
  Task 03C wrote the authorized real Sandbox mandate/attempt: mandate
  **8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064**, cap1000/request600/reserved600/
  consumed0/available400 USD minor units. Available $4 is held-budget accounting,
  not payment success. Disposable test schemas were removed, not persistent data.
  Task 03D additionally prepared US mandate **889b9c4a-b875-5de9-a354-18a037d41f52**,
  attempt **422ae62d-cd25-425f-9fdb-ce50ad6f0ffa**. Task03G now verifies US cap1000/
  consumed600/reserved0/available400 USD minor units, **SUCCEEDED/CONSUMED** and the
  single capture above. Task03D's original hold audit and every original financial/
  audit row remain unchanged versus Task03E baseline. Remaining reservation across
  both mandates is the **original $6**; US spent $6 with $4 available.
  Task05A added only its new zero-reservation mandate/merchant/MANDATE_CREATED row;
  Task05C added one separate mandate, merchant and three audit records. Persistent
  totals are four mandates/merchant rows, two historical attempts, and four
  historical financial idempotency rows. Task05B inspection recorded 18 audits,
  including the later user-triggered STARTED/FAILED pair; the prior 16 count is
  historical. Every table row stayed unchanged during Task05B; schema/checksum unchanged.
- **Previously recorded validation (Task05A, 2026-10-27):** **176 Solidity + 142 agent + 431 web + 19 real
  disposable DB = 768 distinct passed**. Root/script TypeScript, Biome/Foundry,
  root production build, final web rebuild, legacy preview and actual blocked/
  watermarked mocked-pending UI passed. Historical financial/audit/auth hashes
  unchanged; fresh actual US order/capture read remains COMPLETED, no payment
  mutation. Secret/browser checks passed for 51 chunks. No live Gemini inference
  was executed; user deferred the missing key. Task04 results remain historical
  adapter/protocol evidence, not external Google validation. See Task05A log/report.

- **Prior verification (2026-10-28 diagnosis):** real synthetic Gemini proposal/
  policy validation passed; authentication and configured native function calling
  verified. Gemini 65 focused, PayPal 259 (20 opt-in skipped), shared web Gemini 30
  (overlapping) and isolated Anvil 29 tests passed; earlier concurrent Anvil startup
  failure is recorded below. Root/script TypeScript, production build, full lint/
  format, whitespace and actual-value/browser secret scans passed. No DB connection,
  durable intent, reservation, PayPal request or server restart occurred.

- **Latest verification (Task05B, 2026-10-28):** owner-authenticated application
  live synthetic inference passed, six HTTP200/STOP responses and ten policy
  checks. Gemini 65 and PayPal 264 passed (20 opt-in integrations skipped); readonly
  PostgreSQL schema/ledger checks and every-row/owner-auth hashes passed. Root/
  script TypeScript, production build, full lint/format/whitespace and secret/
  browser boundaries passed (339 tracked/369 candidates/52 chunks, zero matches).
  No persistent DB or financial write, PayPal call, deployment or publication.

## Architecture and operating notes

- npm workspaces: `contracts`, `agent`, `web`; separate Node worker in `api/src`.
- Next.js **16.4.3**, React **19.3.0**, TypeScript **5.9.3**, Tailwind **4.3.3**,
  Vitest **5.0.3**, Zod **4.6.7**, `viem` **2.57.3**, `pg` **8.23.1**.
- Solidity **0.8.28**, OpenZeppelin **5.6.1**, pinned Foundry **1.8.5**.
- `web/`: dashboard, earmark creation/listing, execution console, payment/activity
  screens, resolution, themes, recorded demos, owner wallet integration and routes.
- `agent/`: server-only Gemini/Qwen/Mock models, eight validated tools, provider
  quote/delivery inspection, trusted purchase identities and durable journals.
- `api/`: preserved legacy hosted worker, exclusive database locks and receipt-only
  recovery. It is not a PayPal worker.
- `contracts/`: original TaskVault mandate, budget, provider, escrow, deadline and
  dispute rules, with unit/fuzz/invariant tests.
- Neon tables include `earmark_schema`, `earmark_environment`,
  `earmark_workspaces`, `earmark_intents`, `earmark_launch_nonces`, `earmark_runs`,
  `earmark_events` and `earmark_provider_calls`. Session advisory locks require
  direct/unpooled connections. Existing binding is not reusable as a PayPal binding.
- Stable `@flint/*` package names, `Flint Owner Launch` EIP-712 domain, identity
  namespaces, `FLINT_*` settings and durable storage keys are intentionally retained.
- Models propose actions; deterministic code validates authority, providers,
  amounts, deadlines, commitments and idempotency. Keys stay server-side.

### Local commands

Use Node 22.14+ within 22.x and npm 10/11. Dependencies are already installed locally.

```powershell
# Credential-free frontend / recorded demonstrations:
npm run dev

# Production frontend build and serving:
npm run build --workspace @flint/web
npm start

# Preserved disposable local EVM workspace:
npm run setup:contracts
npm run web:local

# Full verification (requires pinned Foundry for contract/local-chain coverage):
npm run typecheck
npm test
npm run build
npm run format:check
npm run lint
npm audit --audit-level=high
node --test scripts/deployment-recovery.test.mjs scripts/testnet-funding.test.mjs
node node_modules/vitest/vitest.mjs run scripts/gemini-readonly-fixture.test.mjs
node scripts/check-web-boundary.mjs
node scripts/preview-smoke.mjs
```

Next.js loads `web/.env.local`, not the root `.env.example`. Templates contain only
placeholders. Gemini/network inference is disabled by default. PayPal settings are
`PAYPAL_ENVIRONMENT=sandbox` and `PAYPAL_PAYMENTS_ENABLED=false`; credential names
are `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID`.

`GET /api/integrations/paypal` reports the backend foundation without network
readiness verification. Existing payment fields remain false for unwired UI/agent
entrypoints; `backendImplemented` is true and `sandboxVerified` is false. Live
origins/invalid flags are rejected. Backend and low-level payment dispatch switches
are separately disabled by default.

## 2026-10-25 — Task 01: independent migration and PayPal preparation

### Request and repository inspection

The user requested an independent, buildable copy of Earmark in the new PayPal
repository, retaining the original application and security demonstrations,
documenting legacy dependencies before changes, preparing Sandbox configuration,
and leaving the original repository untouched. Deployment and real/Sandbox payments
were prohibited.

The destination directory was empty and initially inherited an unrelated ancestor
Git context. A local original checkout was found at `../project-flint`. Its
existing modified `HANDOFF` and untracked demo media were recorded and excluded
from migration inputs. GitHub remote inspection timed out/required authentication;
`gh` was not installed. The local committed source was used without claiming its
remote HEAD or the destination remote contents were verified.

### Migration and change inventory

1. **Pre-change documentation and integrity tools**
   - Added `docs/migration/legacy-dependencies.md` before application changes:
     architecture, package versions, database tables, model/tool logic, financial
     authority, hosting and exact Monad/Solidity/Foundry/wallet coupling.
   - Added `scripts/source-integrity.mjs`: capture/compare original Git state and
     SHA-256 file hashes without storing contents. Baseline is ignored at
     `.tools/source-integrity.json`.
   - Created a temporary minimal `.gitignore` and ignored `.tools/.gitkeep` to
     prepare baseline storage; the source export subsequently supplied the final
     original ignore rules. Neither is a standing source-repository dependency.
2. **Independent source import**
   - Exported all 260 tracked files from committed revision `cc20daa` using
     `git archive`, then initialized fresh destination Git metadata and configured
     the requested `origin`. Original `.git` history was not copied.
   - Imported `agent/`, `api/`, `contracts/`, `web/`, tests, assets, `scripts/`,
     configuration, historical `docs/`, `demo/` evidence and deployment manifests.
   - Excluded ignored credentials/environment files, `.neon`, dependencies, build
     outputs, caches, generated tools and uncommitted source work.
   - Installed destination dependencies independently. No original `node_modules`
     or generated Foundry binaries/artifacts were reused.
3. **Package manifests and verified patch dependencies**
   - Modified `package.json`: public root package name `earmark-paypal` and root
     `start` script for the web workspace.
   - Modified `web/package.json`: Next.js 16.4.0 → 16.4.3 and Zod 4.6.5 → 4.6.7.
   - Modified `agent/package.json`: Zod 4.6.5 → 4.6.7.
   - Updated `package-lock.json` for naming and these patch releases. Internal
     `@flint/*` workspace identities were preserved.
4. **Environment, CI and preview configuration**
   - Modified `.env.example` and `web/.env.example`: server-only Sandbox/Gemini/
     dedicated-Neon placeholders, disabled payment defaults, loading instructions
     and explicit separation from legacy EVM configuration.
   - Modified `.env.stage8a.example`: marked it as legacy Monad reference only.
   - Modified `.github/workflows/ci.yml`: Earmark PayPal identity, `main`/`dev`
     coverage and dependency installation with lifecycle scripts disabled.
   - Replaced `render.yaml` with a new-repository Next.js preview blueprint,
     disabled financial/network defaults, read-only preparation health route and
     `autoDeploy: false`. No hosting service was created.
5. **Application branding and honest integration status**
   - Modified `web/src/components/glass.tsx` and
     `web/src/components/navigation.tsx`: Earmark PayPal wordmark/accessibility.
   - Modified `web/src/app/layout.tsx`: product metadata, global preparation banner
     and footer explaining retained legacy EVM records/actions.
   - Modified `web/src/app/opengraph-image.tsx`: PayPal name and preparation copy.
   - Updated page titles in `web/src/app/page.tsx`,
     `web/src/app/activity/page.tsx`, `web/src/app/executions/[id]/page.tsx`,
     `web/src/app/mandates/new/page.tsx`, `web/src/app/mandates/page.tsx`,
     `web/src/app/payments/page.tsx` and `web/src/app/security/page.tsx`.
   - Kept original crystal assets, styling, routes, wallet behavior, authorization
     logic, financial lifecycle and recorded receipt provenance.
6. **Preparation-only PayPal boundary**
   - Added `web/src/server/paypal-config.ts`: server-only Sandbox/disabled-payment
     status validation, with no network client or secret values in output.
   - Added `web/src/app/api/integrations/paypal/route.ts`: read-only, uncached GET
     preparation status; invalid configuration returns a sanitized 503.
   - Added `web/test/paypal-config.test.ts`: rejects live/enabled configuration and
     checks that status cannot expose supplied credentials.
   - Modified `scripts/check-web-boundary.mjs`: include PayPal server credential
     names in the compiled browser chunk boundary check.
7. **Verification tooling and inherited failure fixes**
   - Modified `scripts/setup-foundry.mjs`: longer network timeout and optional
     `FOUNDRY_ARCHIVE_PATH`, retaining the original pinned checksum verification.
   - Modified `web/test/security-recordings.test.ts`: resolve evidence with
     `import.meta.url` instead of a workspace-dependent working-directory path.
   - Added `scripts/migration-audit.mjs`: compare original committed blob hashes
     with destination files and scan candidate source for secret patterns and
     non-template environment files; report paths/counts, not secret contents.
   - Added `scripts/preview-smoke.mjs`: local production server, seven route checks,
     four scenario controls, preparation endpoint, desktop/mobile screenshots and
     browser-error/overflow assertions. Blocks external requests and mutations.
8. **Project documentation**
   - Preserved the original README at `docs/migration/original-readme.md` with an
     explicit historical-provenance heading; rewrote root `README.md` for the new
     app, setup, configuration, checks and documentation links.
   - Added `docs/paypal-integration.md`: future provider-neutral policy boundary,
     consent, ledger/schema, currency conversion, Sandbox transport, webhook,
     idempotency and recovery sequence; payment lifecycle semantic differences.
   - Added `docs/migration/implementation-report.md`: migration scope, exact
     verification outcomes, limitations and recommended next steps.
   - Modified `docs/architecture.md`, `docs/branding.md`, `agent/README.md` and
     `web/README.md` to distinguish current PayPal identity from legacy material.

At migration completion, 232 of the original 260 files were byte-identical and
all original tracked paths remained present. The audit scanned 270 candidate
files with no credential-pattern findings. These are historical migration counts;
new documentation and subsequent work will change destination totals.

### Validation, failures and their resolution

- Initial `npm ci` exceeded the tool timeout; retry with scripts disabled and
  longer timeout succeeded. Patch updates were installed with scripts disabled.
- Initial Foundry download timed out. Downloaded the official 1.8.5 archive to
  ignored local storage and installed only after matching the pinned SHA-256.
  Solidity compilation then succeeded; existing compiler lint notices remained.
- Initial tests failed because Anvil/compiled artifacts were absent, plus the
  evidence-path bug noted above. Installing/building Foundry and fixing the path
  resolved those failures.
- The inherited Next.js build compiled pages but exited with a security error.
  `npm audit` identified Next.js/Zod advisories. The patch upgrades resolved the
  build failure and the final audit reported zero vulnerabilities.
- A concurrent build/test run exceeded three inherited five-second Gemini-session
  timeouts. The isolated web suite, then final full `npm test`, passed without
  weakening assertions or timeouts.
- A generic Node invocation initially included a Vitest-only script test; the
  final checks used the appropriate Node and Vitest runners separately.
- An initial preview-smoke selector omitted scenario letter prefixes; corrected
  the verification selector and all four controls passed. Application controls
  themselves were preserved.
- Formatter issues in added documentation/scripts were corrected. Final complete
  formatting and lint checks passed.

**Final recorded results:**

- `npm run typecheck`: passed (agent, web, API).
- `npm test`: passed — 176 Solidity + 140 agent + 175 web cases; five PostgreSQL
  integration cases skipped because no dedicated test database was supplied.
- Additional script checks: 21 Node tests and four Vitest cases passed.
- `npm run build`: passed across contracts, agent and Next.js production build.
- `npm run lint` and `npm run format:check`: passed; informational legacy style
  suggestions do not represent a failed lint run.
- `npm audit --audit-level=high`: passed, zero vulnerabilities at that time.
- Browser boundary: passed for 42 compiled JS chunks.
- Read-only production browser smoke: seven routes and four recorded scenario
  controls passed; 390px mobile layout had no horizontal overflow; no browser
  exceptions. Screenshots are ignored at `.tools/paypal-preview-desktop.png` and
  `.tools/paypal-preview-mobile.png`.
- Original integrity: HEAD, refs, status, diff and 305 hashes matched the baseline.
- No deployment, public-chain payment, PayPal Sandbox payment, live Gemini
  inference or real Neon connectivity verification was performed. Full inherited
  Playwright E2E was retained but not executed.

### Preserved security demonstration meaning

- **A — Normal Purchase:** provider comparison, permitted local mock payment,
  inspection, acceptance and settlement after the full challenge period.
- **B — Prompt Injection:** actual deterministic mock policy ignores a redirect;
  a separate unauthorized-provider probe reverts. No live-model robustness claim.
- **C — Invalid Delivery:** deterministic inspection blocks acceptance; owner
  rejection restores available budget/headroom.
- **D — Budget Exhaustion:** two distinct four-USDC reservations succeed; a third
  exceeds the ten-USDC cumulative cap. The first reservations remain obligations.

Local Anvil evidence, historical Monad records and PayPal integration status must
continue to be labelled separately.

## 2026-10-25 — Create the active handoff and continuous documentation rule

**User request:** create a new handoff documenting all completed work and always
document every subsequent change.

**Changes:**

- Added `HANDOFF-PAYPAL.md`: active status, architecture, operating commands,
  complete migration change inventory, verification history, known limitations,
  next steps and this documentation change record.
- Added root `AGENTS.md`: persistent instruction to read this handoff and log
  every future code/dependency/configuration/test/script/documentation change,
  affected paths, rationale, actual checks, blockers and follow-up work.
- Updated `README.md`: direct links to the active handoff and repository
  documentation requirement.

**Fresh verification for this documentation request:**

- `node node_modules/prettier/bin/prettier.cjs --check AGENTS.md HANDOFF-PAYPAL.md README.md`:
  passed for all three files.
- `node scripts/migration-audit.mjs`: passed; 272 candidate files scanned, no
  credential-pattern findings or missing original tracked paths; 232 original
  files remain byte-identical.
- `git diff --check`: passed; repository files remain untracked, so this command
  does not replace the explicit formatting check above.
- Reviewed current Git status and remote configuration. No commit, push or
  deployment was performed. No blocker to using the new handoff.
- Application tests/build were not rerun for this documentation-only request.
  Earlier migration results above remain historical results, not fresh runtime
  verification. Future changes must append their own dated records here.

## 2026-10-25 — Task 02: PayPal Sandbox backend foundation

Request: implement isolated PayPal Sandbox database/policy/client/webhook/recovery
infrastructure with mocked tests; preserve UI, Gemini tools and legacy contracts;
no deployment or payment execution. Read the required four architecture documents,
this handoff, repository rules, database adapters, signed launch authorization,
agent tools/models, Vitest conventions and installed Next.js Route Handler guide.
Consulted official PayPal OAuth, Orders create/get/capture, idempotency and webhook
signature verification documentation. New backend will use a separate
`earmark_paypal` schema and server-only modules, with no public financial endpoints
or autonomous agent wiring. Exact amounts, transactionally locked budgets,
immutable attempt/request identities and read-only reconciliation are required.

Fresh Git inspection shows local `main` and local remote-tracking `origin/main`
at `aa69c9b` (Initial Earmark PayPal migration) with a clean worktree. This updates
the earlier current-state note about uncommitted migration files; that note was
accurate when written. No fetch/push was performed during this inspection.
Changed paths, implementation details and fresh checks will be appended as work
is completed below.

### Completed implementation and file inventory

- Added `database/paypal/001_sandbox.sql`: separate Sandbox schema/version history,
  mandates/merchants, exact ledger counters, immutable attempts and PayPal references,
  idempotency, verified webhook inbox and append-only audit; row/ledger/immutability
  constraints and deferred reconciliation triggers. No migration applied.
- Added `web/src/server/paypal/domain.ts`, `web/src/server/paypal/policy.ts`,
  `web/src/server/paypal/repository.ts` and `web/src/server/paypal/postgres.ts`:
  strict neutral policies and exact minor units, transactional
  reservations, durable pre-dispatch claims, terminal ledger invariants, isolated
  direct-Neon connection/binding and legacy-database refusal.
- Added `web/src/server/paypal/config.ts` and `web/src/server/paypal/client.ts`:
  pinned Sandbox origin,
  separate disabled-by-default backend/payment flags, server-only credentials,
  OAuth cache/coalescing, single-seller Orders transport, stable request IDs,
  bounded safe-read retries/timeouts and sanitized ambiguous financial failures.
- Added `web/src/server/paypal/service.ts`: owner-invoked creation/capture, fresh
  buyer-approval and policy revalidation, immutable response binding, no blind
  re-creation/recapture, revocation and exact budget resolution, read-only recovery.
- Added `web/src/server/paypal/webhooks.ts`, `web/src/server/paypal/runtime.ts`,
  `web/src/server/paypal/http.ts` and
  `web/src/app/api/paypal/webhooks/route.ts`: documented PayPal signature
  verification, full-event verification, bounded ingress, verified-only durable
  deduplication, trusted order/capture reconciliation, out-of-order handling and
  durable failure/backoff recovery. Public financial routes remain absent.
- Added `scripts/paypal-migrate.ts` and `scripts/paypal-recover.ts`; modified
  `package.json` with `paypal:db:plan`, `paypal:recover`, `paypal:test` commands.
  Both operational commands default to offline plans. No dependencies added.
- Added mocked test files `web/test/paypal-policy.test.ts`,
  `web/test/paypal-service.test.ts`, `web/test/paypal-client.test.ts`,
  `web/test/paypal-postgres.test.ts`, `web/test/paypal-webhooks.test.ts` and helper
  `web/test/fixtures/paypal.ts`. Added default-disabled
  `web/test/paypal-database.integration.test.ts` and
  `web/test/paypal-sandbox.integration.test.ts`; the latter is OAuth-only.
- Modified `web/src/server/paypal-config.ts` and `web/test/paypal-config.test.ts`
  for truthful backend-foundation status while retaining false UI/agent payment
  fields; added explicit backend/readiness/autonomy metadata.
- Modified `.env.example` and `web/.env.example` with Sandbox origin/flags/seller
  and dedicated database placeholders, plus opt-in integration-test settings.
- Modified `scripts/check-web-boundary.mjs` to also prohibit PayPal client-ID
  variables in browser chunks (alongside server secrets/database settings).
- Modified `AGENTS.md`, `README.md`, `docs/paypal-integration.md`; added
  `docs/paypal-backend.md` for the implemented architecture, schema, API behavior,
  operator commands, exact accounting, consent/revocation/recovery semantics,
  security limitations, official API references and remaining integration steps.
- Preserved original UI/agent tool execution/Solidity/Monad schema implementations.

### Implementation progress notes (superseded by final results below)

- Initial focused PayPal run: 97 passed, five optional integration checks skipped.
- TypeScript initially identified strict optional-property/test mock typing issues;
  fixed those without weakening compiler settings. Subsequent typecheck passed.
- `npm run paypal:db:plan`: passed offline, with `databaseContacted: false`.
- No PostgreSQL/Docker executable was available; real SQL transaction/constraint
  checks and Sandbox connectivity remain unexecuted. The unit-test concurrent
  repository mock is not evidence of real database concurrency verification.
- Review hardened pending-capture monotonicity, schema/record identity checks,
  replay guards and read-only recovery diagnostics. Final checks are pending.
- Full intermediate regression run passed: 176 Solidity, 140 agent and 273 web
  cases, ten optional/database cases skipped; build/typecheck/format/lint/audit
  passed. Source integrity still matched 305 original hashes. Subsequent final
  API review added canonical GET handling for partial financial responses and
  verified order-hint correlation when capture GET omits related IDs; their
  dedicated tests and final rerun are being completed.

### Final verification and outcomes

Final persistence review additionally corrected PostgreSQL trigger/upsert
interaction: existing attempts now use UPDATE, so a new-row-only INSERT guard is
not run on lifecycle updates. Added a regression case and extended the opt-in real
database case through approval/capture. Database time is refreshed after lock
acquisition and financial-claim triggers independently check activity/expiry.
The final web suite, TypeScript, production web build and offline migration plan
all passed after those persistence changes.

- `npm run typecheck`: passed for agent, web and API after the final API hardening.
- `npm test`: full root run passed — **176 Solidity + 140 agent + 277 web = 593
  cases**, before the last persistence-review fix and its additional regression.
  After that fix, `npm run test --workspace @flint/web` passed **278** cases.
  Latest suite totals are **176 + 140 + 278 = 594 passed**, including **105
  PayPal-specific mocked cases** (the updated two status tests are included).
  Ten cases skipped: five inherited PostgreSQL integration,
  four isolated PayPal PostgreSQL integration and one opt-in Sandbox OAuth check.
- All requested mocked scenarios are covered: authorization, unauthorized agent/
  merchant, expiry/revocation, per-transaction/cumulative/concurrent limits,
  currency, duplicate order/capture attempts, ambiguous timeouts, rollback,
  verification failures, duplicate/out-of-order webhooks and durable recovery.
- `npm run build`: passed for contracts, agent and Next.js, including the new
  `/api/paypal/webhooks` route. Existing Solidity compiler informational warnings
  remain; no contracts or legacy tests were changed by this task. The final web
  production build passed again after the persistence fix.
- Complete Prettier check passed. Biome lint with warnings-as-errors passed for
  191 files; Foundry `fmt --check` also passed. Two initial new-code lint warnings
  (optional chain/type-only import) were corrected before final checks.
- `npm audit --audit-level=high --fetch-retries=0 --fetch-timeout=30000`: passed,
  zero vulnerabilities. No dependencies or lockfile versions were changed.
- `npm run paypal:db:plan` and `npm run paypal:recover`: passed in offline plan
  mode. No database contacted/migration applied or provider payment requested.
- `node scripts/preview-smoke.mjs`: passed seven production routes, all four
  scenario controls, status endpoint, mobile layout and browser exception checks;
  external services and browser mutations blocked. Ignored outputs
  `.tools/paypal-preview-desktop.png` and `.tools/paypal-preview-mobile.png` were
  refreshed. Test/build commands also refreshed ignored `agent/dist/`,
  `contracts/out/`, `contracts/cache/`, `web/.next/` and TypeScript cache artifacts;
  no generated output was copied from or written into the original checkout.
- `node scripts/check-web-boundary.mjs`: passed for 43 compiled browser JS chunks.
- `node scripts/migration-audit.mjs`: passed, 295 candidate files scanned, no
  credential-pattern findings or missing original tracked files. The original
  source comparison still has 232 byte-identical files.
- `git diff --check`: passed. Source integrity verification passed: original HEAD,
  refs, status, diff and 305 file hashes still match the baseline, including its
  ignored environment files and pre-existing user work.
- The final post-persistence-change complete formatting check, Biome check and
  43-chunk browser boundary check passed again. The migration plan was rerun
  against the final SQL file in offline mode only.

Implementation review also corrected SQL block terminators before any application
and strengthened schema/JSON bindings, ledger checks and immutable request IDs.
Actual PostgreSQL execution remains unverified because the opt-in test database
was unavailable; the mocked concurrent test does not prove PostgreSQL locking.
The final transport tests cover partial successful POST responses requiring a
canonical GET and preserving ambiguity if that GET fails. Verified webhook hints
still require complete trusted order/capture membership checks before resolution.

No autonomous payment tool, public financial endpoint, real/Sandbox payment,
database application, AWS/other deployment, Git commit or push was performed.
Existing UI, legacy EVM/Solidity, original database tables and Gemini tools are
preserved. The isolated backend is ready for authenticated checkout/database/
Sandbox integration work, not a claimed verified payment flow. Operational limits
include single configured seller, no refund/dispute automation, manual escalation
for unknown order references and no scheduled worker. Details and operator commands
are in `docs/paypal-backend.md`.

## 2026-10-26 — Neon configuration and read-only migration readiness inspection

Request: identify expected variables/environment-file location, verify server-only
loading/Git exclusion, connect read-only to the newly configured Neon database,
check isolation from the original Earmark database and inspect migration safety.
No migration, deletion, payment, deployment or original-repository changes allowed.

Inspected the PayPal adapter/runtime, shared Neon pool, migration runner, SQL,
templates, Git exclusions and installed Next.js environment-loading guide. A
temporary ignored `.tools/paypal-env-summary.mjs` reported variable names and
configuration booleans only; no connection string, host, username or password was
printed. It found `web/.env.local` with pooled `DATABASE_URL` and direct
`PAYPAL_DATABASE_DIRECT_URL`, but the application expects direct
`PAYPAL_DATABASE_URL` and `PAYPAL_DATABASE_ENVIRONMENT=sandbox`; both were absent.
Both URLs classify as Neon, with the expected pooled/direct distinction and a
different endpoint from the pinned legacy source. Git confirms local env paths
are ignored and untracked. Read-only connection/isolation checks and final results
will be recorded below.

### Changes and fresh results

- Updated ignored `web/.env.local` by adding only non-secret
  `PAYPAL_DATABASE_URL=$PAYPAL_DATABASE_DIRECT_URL` and
  `PAYPAL_DATABASE_ENVIRONMENT=sandbox`. Existing pooled/direct credential values
  were preserved; the file was not read into tool output or staged in Git.
- Added `scripts/paypal-env.ts`: shared server/CLI Next.js environment loading from
  the `web/` workspace with expansion and sanitized loading errors. Modified
  `scripts/paypal-migrate.ts` and `scripts/paypal-recover.ts` to load those settings
  only when explicitly running their operations; default offline behavior remains.
- Added `scripts/paypal-db-inspect.ts` and `package.json` command
  `paypal:db:inspect`: redacted configuration/bundle checks, plus explicit
  `--connect` for bounded read-only TLS/catalog/privilege inspection. It refuses
  the pinned legacy endpoint and does not import or execute migration operations.
- Updated `README.md` and `docs/paypal-backend.md` with exact names, local alias,
  corrected CLI loading/commands, read-only inspection, SQL review and readiness.
- Temporary ignored `.tools/paypal-env-summary.mjs` assisted initial key-name-only
  inspection; it contains no configured credentials.
- Fresh connection succeeded. Client TLS and certificate authorization passed;
  transaction was READ ONLY and rolled back. Configured database identity matches,
  pooled/direct target matches, legacy endpoint differs, legacy tables are absent,
  user-table count is zero, and the PayPal schema is absent. Required schema-create,
  PL/pgSQL and advisory-lock execution privileges are available.
- PostgreSQL cannot prove the Neon console project display name. Isolation here
  means endpoint/configured-database matching plus absence of original markers,
  consistent with the user's newly created dedicated project.
- Initial diagnostic incorrectly used compute-side `pg_stat_ssl` alone for TLS.
  Corrected it to inspect the actual client TLS socket/certificate: Neon proxy
  termination explains the compute-side false result. TLS validation was not
  disabled or weakened.
- The first npm-forwarded `--connect` was interpreted by npm instead of reaching
  the script and stayed offline. The documented direct Node invocation then ran
  the read-only check successfully.
- No `NEXT_PUBLIC_` database configuration was present. Existing 43 compiled
  browser chunks had zero configured URL/password matches; this was an existing
  artifact scan, not a new production build.
- Git ignore checks matched `.gitignore` for `web/.env.local` and `.env.local`;
  neither is tracked (the initial `git ls-files --error-unmatch` nonzero exit was
  the expected confirmation of that fact).
- SQL reviewed unchanged at its existing checksum: only additive objects/seed
  INSERT in the new schema; protective trigger UPDATE/DELETE references do not
  execute deletion. No destructive DDL, data clearing or changes to original
  Monad tables were found. SQL execution remains untested because no migration
  application was authorized.
- Fresh verification: strict targeted TypeScript check passed for
  `scripts/paypal-env.ts`, `scripts/paypal-db-inspect.ts`,
  `scripts/paypal-migrate.ts` and `scripts/paypal-recover.ts`, using the existing
  ESNext/bundler conventions, exact optional properties and unchecked-index checks.
  The first invocation used an invalid `--esModule` option; corrected it to
  `--module` and reran successfully.
- Biome warnings-as-errors passed for 193 files. Targeted formatting passed.
  `paypal:db:inspect`, `paypal:db:plan` and `paypal:recover` all passed in their
  default offline modes after the shared-loader change. The unchanged migration
  checksum still matches the Task 02 SQL. `git diff --check` passed.
- Application tests, the production build and real database integration tests were
  not rerun: this request changed local non-secret mapping, diagnostic/CLI loading
  and documentation. Prior Task 02 test/build results remain historical; fresh
  Neon readiness evidence is limited to the explicit read-only checks above.

Readiness: **passed preflight for a separately approved migration**. It is not
runtime schema readiness or a working payment-flow claim. No migration, customer
data write/deletion, payment, original-repository change, deployment or Git
publication was performed.

## 2026-10-26 — Task 03A: authorized migration and real PostgreSQL tests

### Implementation progress (final outcomes follow)

The user explicitly authorized applying only `database/paypal/001_sandbox.sql` to
the verified dedicated PayPal Sandbox database, followed by catalog verification,
real PostgreSQL accounting/concurrency tests in disposable isolation, and full
regression checks. No PayPal API payments, Live APIs, deployment or Git publication
are authorized. Reviewed the exact SQL and existing tooling/tests. Fresh read-only
preflight loaded `web/.env.local`, confirmed Sandbox/direct alias/pooled-target
consistency, verified client TLS/certificate and database identity, found no legacy
objects, zero user tables and no `earmark_paypal` schema. Required privileges pass.
The exact approved SQL SHA-256 remains
`eaa2680ae6a842456989b3895b944b73d4e1fd551a5ee66161ed836c42ba21ad`.

The previous four real database tests only support an empty loopback database and
would drop a fixed schema. They must be adapted to a generated, session-owned test
schema before use on Neon. Persistent `earmark_paypal` data must never be included
in test writes or cleanup. Changed paths, migration evidence, failures and final
checks will be recorded below as work completes.

Migration execution: hardened `scripts/paypal-migrate.ts` using new
`scripts/paypal-db-safety.ts` to pin the reviewed checksum, check direct/alias/
pooled target consistency and reject the legacy endpoint, verify live client TLS,
database identity/legacy markers and fresh namespace on the same connection under
the migration lock. Applied with the existing runner's `--apply`: the exact
approved SQL and version/checksum history INSERT committed successfully in one
transaction. Added `scripts/paypal-db-verify.ts` for independent read-only catalog,
seed, checksum, ledger type/trigger and persistent-row verification. Catalog
results and real tests are pending; no payment APIs were invoked.

Independent catalog verification passed: eight tables, 16 valid indexes, eight
primary keys, six unique constraints, six foreign keys, 21 CHECK constraints, seven
enabled application triggers (two deferred ledger checks), and six PL/pgSQL
functions. Sandbox seed/version and migration checksum history match. Persistent
application row counts remain zero; only environment/history have one seed each.
No unrelated tables or disposable test schemas were present.

Added `web/test/fixtures/paypal-database.ts` for generated UUID-namespaced test-only
SQL routing and owner/OID-checked cleanup, updated
`web/test/paypal-database.integration.test.ts` to retain the original four cases
and add revocation, ambiguous/pending outcomes, concurrent capture claims and
terminal-state tests. Added `scripts/paypal-db-test.ts` and package commands for
explicit Neon-only/full regression execution. The launcher revalidates the
migrated target and disables Sandbox network tests, payment flags and legacy DB
test connections. All PayPal responses in these tests remain mocks; the database
transactions/constraints/concurrency are real PostgreSQL.

The first isolated Neon run passed all eight real database cases, including all
four previously skipped cases. Cleanup removed the generated schema. Test helper
checkout initially attached duplicate error listeners to reused pool clients,
causing MaxListeners warnings; fixed with one guard per client via WeakSet rather
than suppressing the warning or increasing listener limits. Persistent data and
post-cleanup catalog checks will be rechecked. Updated the existing redacted
`scripts/paypal-db-inspect.ts` to report installed Sandbox/checksum markers after
migration, instead of incorrectly continuing to label the migration unapplied.

### Final outcomes, changed paths and verification

- Applied `database/paypal/001_sandbox.sql` unchanged with the explicitly authorized
  migration runner. COMMIT succeeded; no migration failure/rollback was observed.
  The runner now pins the approved checksum, verifies direct/alias/pooled target
  consistency, rejects the original endpoint, rechecks actual TLS/database/legacy
  markers and fresh namespace under its lock, and rolls back on failure.
- Added `scripts/paypal-db-safety.ts`, `scripts/paypal-db-verify.ts`,
  `scripts/paypal-db-test.ts` and `web/test/fixtures/paypal-database.ts`; modified
  `scripts/paypal-migrate.ts`, `scripts/paypal-db-inspect.ts`,
  `web/test/paypal-database.integration.test.ts` and `package.json` for hardened
  operation guards, independent catalog verification, truthful installed status,
  explicit real-Neon launchers and session-owned disposable test isolation.
- Added `docs/task-03a-database-report.md`; updated `README.md`,
  `docs/paypal-integration.md` and `docs/paypal-backend.md` for the applied state,
  commands, evidence, isolation model and remaining Sandbox API prerequisites.
- Catalog checks passed before and after real tests: eight tables; 16 valid
  indexes; eight primary keys; six unique constraints; six foreign keys; 21 valid
  CHECK constraints; seven enabled triggers, including two deferred ledger checks;
  six PL/pgSQL functions; exact numeric accounting columns, mandate lifecycle,
  Sandbox seed, audit identity and version/checksum history all verified.
- Persistent `mandates`, `approved_merchants`, `attempts`, `idempotency`,
  `webhook_events` and `audit` remain empty. `environment`/`schema_migrations` have
  one row each. No disposable schemas remain; no unrelated user tables exist.
  Only the generated schemas created by each test invocation were dropped.
- `npm run paypal:test:db`: all eight real PostgreSQL cases passed, including the
  four previously skipped cases. The initial test-only listener warning was fixed
  with a WeakSet guard; the final full rerun had no listener warning.
- `npm run paypal:test:db:all`: 176 Solidity + 140 agent + 286 web = **602 passed,
  six skipped**. The eight real database cases cover concurrent caps, raw counter
  rollback, duplicate intents and consumption, immutable/audit protections,
  revocation, ambiguous/pending outcomes, duplicate capture claims and terminal
  transitions. All PayPal responses remain mocks; no payment API request occurred.
- Skips are five inherited Monad DB cases (legacy connections disabled) and the
  optional real Sandbox OAuth case (network tests disabled). No database test
  failed, and PayPal database cases are no longer skipped in the explicit launcher.
- Additional Node recovery/funding cases: 21 passed. Read-only Gemini fixture
  cases: four passed. **627 distinct total passing tests**, six skipped; duplicate
  executions are not counted twice.
- `npm run typecheck`, strict standalone operational-script TypeScript checks,
  Biome warnings-as-errors (197 files), Foundry formatting, and root production
  build passed. Existing Solidity timestamp/loop notices remain unchanged.
- Dependency audit passed with zero vulnerabilities. Read-only browser smoke
  passed seven routes, four scenarios and mobile layout; external/browser mutation
  paths blocked. Browser boundary and actual database credential-value scan passed
  for 43 chunks after building with local server env.
- Read-only post-test catalog verification and installed-status inspection passed.
  One combined catalog/inspection command timed out after successful catalog
  output; the standalone inspector rerun succeeded with
  `PAYPAL_DATABASE_ALREADY_MIGRATED`. No data write was involved in that retry.
- Original source integrity still matches HEAD, refs, status, diff and 305 hashes.
  No original checkout/environment/database was modified or connected for tests.
- No dependency versions, migration SQL, credential values, UI, agent tools or
  payment runtime logic changed. Ignored local build/test outputs and smoke
  screenshots were refreshed only in this checkout.
- Final complete Prettier check, Biome check and `git diff --check` passed after
  documentation updates. `web/.env.local` remains Git-ignored. Full results and
  reproducible commands are recorded in `docs/task-03a-database-report.md`.

The database layer is ready for controlled real Sandbox API testing. Presence-only
checks show client ID, client secret, webhook ID and merchant ID are not configured;
backend/payment flags remain disabled. Configure those server-side and integrate
verified owner identity/buyer approval before separately authorized payment work.
No PayPal API payment, PayPal Live access, deployment, commit or push occurred.

## 2026-10-26 — Task 03B: real Sandbox OAuth only

Request: use locally configured server credentials to prove real PayPal Sandbox
OAuth connectivity and token caching/expiry handling, enable the opt-in positive
OAuth integration check, run mocked negative/regression/build checks, and verify
secret boundaries. Orders, captures, refunds, payouts, Live APIs, deployment,
database record changes and Git publication are prohibited.

Read this handoff, backend guide, Task 03A report, existing client/config/runtime,
OAuth integration test and environment loader. Ignored
`.tools/paypal-oauth-env.ts` performed presence/format/flag-only inspection. Both
OAuth credentials are present, Sandbox origin/environment checks pass, no public
credential variables or insecure TLS override were found, and backend/payment
flags remain disabled. Merchant/webhook IDs are absent. The first configuration
probe exceeded its short tool timeout; retry completed without a network request.
Git confirms local environment files are ignored and untracked.

The current full-backend parser unnecessarily gates OAuth on merchant/webhook
configuration. Plan: extract shared OAuth-only settings, keep strict checkout
requirements, reuse the same PayPalClient authentication/cache code, expose only
non-secret cache metadata and run the real positive test with an exact token-URL
transport allowlist. Do not invent a merchant ID or enable financial operations.

Actual connectivity succeeded: the opt-in positive integration test invoked the
existing PayPalClient only at the official Sandbox token endpoint. Initial grant
and refresh both returned HTTP 200; the client validated Bearer and an expires_in
of 32,400 seconds. Cache reuse, one-millisecond-before-expiry reuse, rejection at
the simulated early cache deadline, and a second successful real OAuth grant all
passed. The 60-second safety margin gives 32,340 seconds usable cache lifetime.
Only the client clock was advanced; no claim that nine wall-clock hours elapsed.
No token, app ID, scopes or credentials were printed/persisted, and no payment
endpoint/database operation was used. The initial focused run passed 106 cases
with eight real-database cases deliberately skipped. A preceding combined
typecheck/test command exceeded its tool timeout before reaching OAuth; the
separate OAuth command then passed. Final negative/regression checks follow.

### Implementation and final results

- Modified `web/src/server/paypal/config.ts`: extracted shared OAuth-only settings
  parsing (Sandbox restrictions/client ID/secret only) and reused it for strict
  full checkout settings. No dummy merchant/webhook ID is used. Full backend
  startup still requires its existing execution flag, merchant and webhook IDs.
- Modified `web/src/server/paypal/client.ts`: retained the single existing Basic
  grant, parsing, retry and cache implementation; added safe metadata for lifetime/
  effective expiry and rejection of whitespace tokens. OAuth-only client settings
  cannot create/capture or verify webhooks. Tokens remain memory-only/server-side.
- Updated `web/test/paypal-sandbox.integration.test.ts` with the real positive
  grant/cache/boundary/refresh check and exact token-endpoint-only transport guard.
  Assertions use booleans, never token strings in diffs. Failures expose only fixed
  code/HTTP status; `.tools/paypal-oauth-result.json` stores selected safe metadata.
- Added `web/test/paypal-oauth.test.ts`: 28 synthetic negative/boundary cases for
  credential/type/expiry parsing, Live/origin rejection, absent capabilities,
  cache boundary/short lifetime, retry bounds and sanitized HTTP 400/401/403 errors.
  Actual local credentials were used only in the positive Sandbox OAuth case.
- Added `scripts/paypal-oauth-test.ts` and `scripts/paypal-secret-check.ts`; updated
  `package.json` with `paypal:test:oauth`, `paypal:test:oauth:all` and
  `paypal:secrets:check`. Opt-in is process-scoped; local credential files and
  persistent backend/payment flags were not changed. Profiles disable database/
  legacy DB tests and actual financial/backend execution; HTTP debug logging is off.
- Added `docs/task-03b-oauth-report.md`; updated `README.md`,
  `docs/paypal-backend.md` and `docs/paypal-integration.md` for actual OAuth evidence,
  commands, no-merchant prerequisite, secret boundaries and checkout blockers.
- Final real case again returned **HTTP 200 twice**, Bearer and a remaining lifetime
  of **31,685 seconds** (31,625 usable with the 60-second safety margin). The earlier
  run returned 32,400 seconds. Lifetimes are parsed dynamically; PayPal can return
  its existing valid app token with remaining expiry. Different token values are
  not assumed. Two runs made four successful OAuth POSTs total; zero payment calls.
- `npm run paypal:test:oauth:all`: **176 Solidity + 140 agent + 307 web = 623 passed,
  13 skipped**. Includes 133 PayPal mocked cases plus the real OAuth case. Skips
  are eight PayPal and five legacy PostgreSQL cases, intentionally disabled to
  avoid database writes during this milestone. No actual invalid-credential API
  requests were sent; all negative authentication checks used mocks.
- Additional Node recovery/funding fixtures: 21 passed. Read-only Gemini script
  cases: four passed. **648 distinct passing cases**, 13 skipped; repeat runs are
  not counted twice. No test or real authentication request failed.
- `npm run typecheck`, strict OAuth-launcher/secret-check TypeScript, Biome (200
  files), complete Prettier check, Foundry formatting and root production build
  passed. Initial short probe/typecheck tool timeouts were resolved by successful
  retries; no compiler assertion or auth error was hidden.
- Dependency audit passed with zero vulnerabilities. Browser smoke passed seven
  routes, four original scenarios, mobile layout and no exceptions, with external
  traffic/browser mutations blocked. The build loaded local server env.
- Secret-value scan passed for 272 tracked files, all nonignored candidates and
  43 production browser chunks; zero raw client-ID/secret/encoded-Basic matches.
  Browser server-variable boundary also passed. Local env files are ignored and
  untracked. No token, client ID, secret, app ID or scopes were printed or newly
  persisted in reports/source; existing local credential values were not edited.
- Original HEAD/refs/status/diff and 305 hashes still match. No original repository,
  production/database record, migration, dependency version, UI, deployment, commit
  or push was changed. Ignored build/test/screenshot artifacts were refreshed only
  in this checkout. Final documentation/source checks are recorded below.
- Final complete Prettier, Biome and `git diff --check` passed after documentation
  updates. Repeated value scan covered **272 tracked files, 306 nonignored candidate
  files and 43 browser chunks**, with zero matches. Both local environment paths
  remain ignored. The OAuth report records all command outcomes and the exact
  merchant-account information needed; credential/token values are not included.

Outcome: **real Sandbox app authentication verified; no OAuth blocker remains**.
Merchant and webhook identities still need the real account/app values. Obtain the
13-character Merchant ID from the corresponding Sandbox Business seller account's
business-information settings; never substitute client/app/buyer ID or email.
Verified owner identity, buyer approval/return/cancel flow and separately authorized
order/capture execution remain required for the first checkout. Standard Orders
API does not imply unattended payments; no payment-flow success is claimed.

## 2026-10-26 — Task 03C: PARTIAL — real order awaits human buyer approval

### Implementation checkpoint (later evidence follows)

Added server-only `web/src/server/paypal/test-config.ts`, `test-auth.ts`,
`test-checkout.ts`, `test-runtime.ts`, `test-http.ts`; authenticated
`web/src/app/api/paypal/test/route.ts` and `[action]/route.ts`; separate
`web/src/app/paypal-test/page.tsx`, `web/src/components/paypal-test.tsx` and
`paypal-test.module.css`. Added owner/campaign-stable mandate identity without a
new migration, read-only mandate/purchase lookup in `postgres.ts`, and existing
policy/service reuse. Updated `config.ts`/`client.ts` for genuine no-webhook manual
checkout settings, credential-owned default seller, and server-fixed return URLs.
Capture/order observations use canonical capture GETs before budget consumption.

Added `scripts/paypal-test-serve.ts` (loopback-only process, ignored random test
credentials, merchant binding and session epochs), `paypal-test-create.ts` (owner
login/mandate/reserve/order only, never approves/captures), `paypal-test-ui.mjs`
(synthetic browser verification with explicit screenshot watermark) and package
commands. Extended `scripts/paypal-secret-check.ts` and
`scripts/check-web-boundary.mjs` for local login/session secrets. Updated
`scripts/preview-smoke.mjs` for the separate route and `web/src/app/layout.tsx`
copy/metadata to identify the controlled test without changing the original UI.

Added `web/test/fixtures/paypal-checkout.ts`, `web/test/paypal-test-auth.test.ts`
and `web/test/paypal-test-checkout.test.ts`; extended the real PostgreSQL suite
with fixed-campaign concurrency/restart/cancellation cases. First PayPal mocked
run passed 166 cases (33 new), with nine external integration cases skipped.
Strict CSS-module optional typing initially failed, fixed with class fallback
without weakening compiler settings; subsequent typecheck passed. Initial lint
found an unused CLI variable/type-only import, both corrected. Full database,
browser and production validation plus actual order creation remain pending.

### Request, preflight and execution plan

The user authorized implementation and local execution of a fixed $10 USD mandate
and $6 Sandbox order/capture, only after human buyer approval. Read handoffs,
backend/API/policy/store/authentication patterns and installed Next.js guides.
Local presence-only inspection confirms OAuth credentials and a valid-format
merchant ID; webhook ID remains absent and no ID will be fabricated. The user
explicitly confirmed the merchant is the Sandbox Business seller associated with
the REST app. Canonical PayPal order payee will independently be checked using
credential-owned default-seller order creation. The initial combined DB preflight
timed out; standalone read-only verification passed: dedicated target/TLS/Sandbox
version/checksum and all objects valid; financial tables empty; no legacy objects.

Plan: loopback-only `/paypal-test` on port 3030, fixed allowlisted test owner with
server-verified password and HMAC HttpOnly session/CSRF, no client-supplied identity
or policies, one stable $10 mandate/$6 intent per owner/campaign, existing policy/
PostgreSQL/client reuse, canonical capture GET validation and explicit human
approval. New local test credentials will be generated only into ignored protected
files, not printed. Existing checkout defaults stay disabled; the operator launcher
enables only this constrained local process. No webhook prerequisite is needed for
manual API reconciliation, and the real webhook handler remains strict/disabled
until a genuine webhook ID is configured. No deployment or Git publication.

### Actual Sandbox order and human stop

The local operator profile authenticated the fixed test owner through its real
HTTP login, created the fixed $10 mandate and $6 reservation, then created exactly
one real Sandbox order. Actual order **9N317079B4816951W**, mandate
**8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064**. No buyer approval was automated and no
capture was sent. The official Sandbox approval link is available only to the
authenticated local UI and the ignored order-result artifact.

`npm run paypal:test:status` independently read Neon in a READ ONLY transaction
and fetched the order using existing OAuth/client code: PayPal status
**PAYER_ACTION_REQUIRED**, 6.00 USD, correct immutable attempt references and
matching credential-owned merchant. Captured amount is zero and capture ID/status
are absent. Persisted state is AWAITING_APPROVAL/RESERVED, with cap1000/request600/
reserved600/consumed0/available400. `objectiveComplete=false`. The required
captured6/remaining4 result is not claimed. This is a genuine order creation/read,
not a mock result; all simulated captures below are test evidence only.

Checkout execution stopped at the required human step. The tester must open
**http://127.0.0.1:3030/paypal-test**, retrieve `loginSecret` locally from
`.tools/paypal-test-auth.json`, sign in, use **Approve with PayPal Sandbox** with a
Sandbox Personal buyer, return, select **Verify buyer approval** then explicitly
**Capture approved $6**. If pending/ambiguous, select recovery rather than a fresh
intent. The local server is intentionally left running. Its PID/origin/epoch are
in `.tools/paypal-test-server.json`; private startup log and local credentials
remain ignored. Sessions expire after 30 minutes; re-login preserves the same
owner/campaign/order. No PayPal buyer credentials are collected by Earmark.

### Final file inventory and behavior

- Added `web/src/server/paypal/test-config.ts`, `test-auth.ts`,
  `test-checkout.ts`, `test-runtime.ts`, `test-http.ts`: loopback/hosted gates,
  merchant/app confirmation binding, random allowlisted server owner, constant-
  time login, HMAC HttpOnly/Lax session, per-server epoch, expiry/logout/rate limit,
  exact Host/Origin/CSRF protection and strict JSON actions. No frontend identity,
  agent, merchant, amount, currency, mandate or purchase-key override is accepted.
- Added `web/src/app/api/paypal/test/route.ts`,
  `web/src/app/api/paypal/test/[action]/route.ts`, `web/src/app/paypal-test/page.tsx`,
  `web/src/components/paypal-test.tsx`, `web/src/components/paypal-test.module.css`.
  Separate themed interface displays authorization/amounts/merchant/order/capture/
  remaining state and manual approval/cancel/recovery. Query returns are hints.
- Modified `web/src/server/paypal/config.ts` and `client.ts` for real no-webhook
  manual checkout settings, default credential seller (no provided payee), and
  server-owned return/cancel URLs. Genuine webhook settings remain strict; no
  fake ID/registration occurred. Canonical capture GETs precede budget consumption.
- Modified `web/src/server/paypal/postgres.ts` with shared parsing/read-only
  mandate/purchase lookup and one-MVCC-statement checkout snapshots, preventing
  status/counter projections from crossing a capture commit. No migration changed.
- Added `scripts/paypal-test-serve.ts`, `scripts/paypal-test-create.ts`,
  `scripts/paypal-test-status.ts`, `scripts/paypal-test-ui.mjs`; updated
  `package.json` commands. Serve enables only the owned loopback process, never
  permanently edits credential/execution flags. Create never approves/captures;
  status uses only reads. Mocked UI screenshots carry an explicit watermark.
- Added `web/test/fixtures/paypal-checkout.ts`,
  `web/test/paypal-test-auth.test.ts`, `web/test/paypal-test-checkout.test.ts`;
  extended `web/test/paypal-database.integration.test.ts` with fixed-campaign
  concurrency and restart/cancellation accounting. Reused existing policy,
  journals, atomic reservations and payment service rather than reimplementing them.
- Modified `scripts/preview-smoke.mjs`, `scripts/paypal-secret-check.ts`,
  `scripts/check-web-boundary.mjs` for the new route and actual local test-secret
  boundaries. No actual credential value is in code or output.
- Modified `web/src/app/layout.tsx`, `.env.example`, `AGENTS.md`, `README.md`,
  `docs/paypal-backend.md`, `docs/paypal-integration.md`; added
  `docs/task-03c-checkout-report.md` with architecture, exact human steps, evidence,
  results, failures and local-auth limitations.
- Ignored `.tools/` artifacts: auth/server/order/status JSON and server log,
  `paypal-test-ui-actual.mjs` plus actual-awaiting desktop/mobile screenshots, and
  separately watermarked mocked UI screenshots. Actual UI inspection only logged
  in locally and read saved state; it blocked external browser requests and never
  clicked approval/capture. Build/test outputs stayed in this checkout.

### Validation and failures actually observed

- Full database-enabled run passed 176 Solidity, 349 web (including ten actual
  PostgreSQL cases); the agent suite initially passed139/failed1 on an inherited
  local Anvil receipt wait. The unmodified entire agent suite then passed140 with
  one worker; no assertion or timeout was weakened. Root initial exit was nonzero
  and is not described as one wholly green command.
- Added a Host-normalization regression after startup diagnostics; PayPal focused
  suite passed167 mocks, eleven integrations skipped. Full latest web rerun passed
  **340**, sixteen integrations skipped; the ten real DB and one real OAuth cases
  were executed successfully in their separate profiles. Real DB fixtures use
  session-owned/OID-checked disposable schemas; persistent test order data is not
  a cleanup target.
- Latest unique workspace coverage: 176 Solidity + 140 agent + 340 ordinary web +
  10 real PostgreSQL + 1 real OAuth = **667 passed**, five original DB cases not
  connected/run. Additional Node21/Gemini4 script cases passed: **692 distinct
  passing cases total**, five never-run legacy DB cases. Runs are not double-counted.
- TypeScript (agent/web/API and strict standalone operator scripts), Biome, full
  production build and read-only browser checks passed. Initial exact optional
  CSS typing and unused/type-only import lint issues were corrected.
- The first two local startup attempts stopped before order creation on an
  over-strict request.url origin comparison. Next normalizes its internal URL;
  incoming Host is now pinned to the configured loopback authority, with unchanged
  exact POST Origin/CSRF and owner verification. New regression and actual HTTP
  login/operation succeeded after rebuild. Only the failed owned children were killed.
- Mocked checkout UI smoke and eight-route existing app smoke passed; actual local
  owner UI shows AWAITING_APPROVAL, $0 captured/$6 held, no mobile overflow/errors.
  Initial actual-UI helper failed with sanitized output, staged standalone retry
  passed without an app behavior change. No approval was simulated in the real flow.
- Real OAuth positive again returned HTTP200/Bearer with cache/refresh checks;
  all negative credential cases remain mocks. Audit/Foundry/source integrity/final
  credential scans are recorded at session completion below. No Live or real-money
  operation, deployment, original-resource write, commit or push occurred.
- Final complete formatting and Biome warnings-as-errors checks passed (217 code
  files). Root production build and final web rebuild passed. Dependency audit
  reports zero vulnerabilities; Foundry formatting passed. Source integrity still
  matches the original HEAD/refs/status/diff and 305 hashes.
- Final value scan covered 272 tracked files, 324 nonignored candidates and 47
  browser chunks, including the generated test login/signing secrets: zero matches.
  Browser server-variable boundary passed and private env/auth artifacts stay ignored.
- Final read-only actual-status check still shows ACTIVE mandate,
  PAYER_ACTION_REQUIRED, AWAITING_APPROVAL/RESERVED, $10 cap/$6 requested/$6 held/
  $0 captured/$4 available, no capture ID, `objectiveComplete=false`. Independent
  catalog/data read confirms one mandate, one approved merchant, one attempt, two
  idempotency records and four audit events; two original seed/history rows intact,
  no disposable test schema or unrelated user table remains. No cap request was
  sent while collecting this read-only evidence.

## 2026-10-27 — Task 03C continuation and final handoff checks

Request: continue the remaining work from the prior session. Reviewed the active
handoff, current checkout report, package commands and read-only status script.

- Updated `docs/task-03c-checkout-report.md` to state the complete workspace total
  explicitly: 667 includes the separately executed OAuth case; adding 25 ancillary
  cases yields 692. The earlier 666 subtotal excluded OAuth, but the wording could
  be read as the complete workspace total. No test outcome or application behavior
  changed; these remain previously recorded results, not fresh test executions.
- Updated this handoff's date and recorded this documentation-only continuation.
- Added fresh continuation evidence to `docs/task-03c-checkout-report.md`:
  `npm run paypal:test:status` confirmed the same order, merchant match, ACTIVE
  mandate, PAYER_ACTION_REQUIRED, AWAITING_APPROVAL/RESERVED, cap1000/request600/
  reserved600/captured0/available400, no capture and `objectiveComplete=false`.
  Zero payment mutations; database transaction was read-only. The first invocation
  exceeded the 120-second tool limit; the standalone retry succeeded.
- Initial local HTTP probe timed out; a bounded curl retry confirmed port 3030 was
  unavailable. Restarted using the existing saved owner with
  `node --conditions=react-server --import tsx scripts/paypal-test-serve.ts --detach`.
  The launcher passed read-only database/checksum preflight and epoch-bound 401
  authentication readiness. A subsequent GET `/paypal-test` returned HTTP 200.
  No new owner, mandate, reservation or order was created. Restart invalidates old
  sessions; re-login uses the same saved secret and durable checkout identity.
- Refreshed ignored `.tools/paypal-test-authoritative-status.json`,
  `.tools/paypal-test-server.json` and `.tools/paypal-test-server.log`; preserved
  `.tools/paypal-test-auth.json` without printing credentials. No application,
  dependency, migration or configuration source changed.
- Targeted Prettier for both changed Markdown files and `git diff --check` passed
  again after the evidence updates. Application tests/build were not rerun for this
  documentation and existing-profile restart. Human Sandbox buyer approval and
  authoritative capture remain the blocker/next milestone. No capture, deployment,
  commit or push was performed.

## 2026-10-27 — Read-only merchant rejection diagnosis

Request: diagnose PayPal's human-facing merchant rejection for existing order
`9N317079B4816951W` without payment or financial-record mutations. The existing
`npm run paypal:test:status` failed with sanitized `PAYPAL_REQUEST_REJECTED`; its
previous successful local artifact must not be mistaken for fresh remote status.

- Added `scripts/paypal-merchant-diagnose.ts`: fixed-order diagnostic using the
  existing client with transport restricted to Sandbox OAuth and Orders v2 GET.
  Projects safe order/link metadata and API error/debug IDs, compares saved
  app/merchant binding, scans local logs without printing raw lines, and compares
  read-only financial snapshots/auth-file contents before and after. No financial
  service or mutation action is invoked.
- Added `docs/paypal-merchant-rejection-report.md`: fresh versus historical status,
  error/debug evidence, seller-binding limits, request/log review, account checks,
  root-cause uncertainty and safe next action. Updated
  `docs/task-03c-checkout-report.md` with a prominent superseding diagnostic notice;
  earlier successful observations are preserved as historical evidence. Updated
  this handoff's current state and continuation guidance accordingly.
- Diagnostic observation at runtime UTC `2026-10-26T23:43:22.462Z`: OAuth HTTP200;
  existing Orders v2 GET HTTP404, `RESOURCE_NOT_FOUND` / `INVALID_RESOURCE_ID`,
  `PayPal-Debug-Id=f341254500bcc`. No current order representation was returned;
  current purchase units/payee/links and approved/voided/completed status cannot be
  freshly confirmed. Prior PAYER_ACTION_REQUIRED/6.00USD/default-seller match is
  historical only. The local status artifact was not overwritten by the failed
  existing status command; no new ignored diagnostic output file was created.
- Saved client-ID/merchant binding and persisted merchant still match current
  configuration. The previous credential-owned default-seller reads established
  routing consistency; actual Dashboard Business type/country/receiving eligibility
  cannot be independently verified through OAuth/order reads. Merchant restrictions
  are suggested by the human message, not proven by an API merchant error code.
- Attempt creation is `2026-10-26T17:37:07.025592Z`, about six hours before the
  diagnostic. Official guidance describes a default three-hour order window;
  expiry is plausible, not an authoritative terminal-state finding or explanation
  of the earlier rejection. Local mandate remains ACTIVE/not time-expired at the
  diagnostic, expiring `2026-10-27T17:37:03.522Z`.
- Reviewed `client.ts`, `test-config.ts`, `test-checkout.ts`, `service.ts` and
  `config.ts` without changing application code: fixed USD6, CAPTURE, default
  credential seller/no payee override, standard wallet experience_context,
  NO_SHIPPING/PAY_NOW, fixed loopback callbacks and validated official token link.
  No buyer-country injection, card/vault/recurring/auto-capture instructions or
  incompatible setting identified. Actual account country/currency eligibility
  remains unknown. Missing webhook ID is unrelated to manual buyer approval.
- Sanitized local server log scan found no matching API error/debug tokens.
  Existing payment client discards non-2xx bodies/debug headers, so original hosted
  checkout error diagnostics cannot be reconstructed from those logs. Fresh GET
  debug ID is not asserted to identify the earlier browser rejection.
- Read-only before/after snapshots matched for mandate, attempt, merchant policy,
  both idempotency rows and all four audit rows; owner-auth file unchanged.
  Accounting remains cap1000/request600/reserved600/consumed0/available400 USD minor
  units, AWAITING_APPROVAL/RESERVED, no capture ID. Zero payment mutation requests.
- Consulted official Orders API/errors, Sandbox account management and standard
  Checkout flow guidance. Two obsolete optional buyer-country doc URLs returned
  404; no conclusion relies on them. Initial script lint found one non-null
  assertion; replaced it with an explicit row guard. Strict standalone TypeScript
  (including exact optional properties/unchecked indexes) and Biome warnings-as-
  errors then passed. Secret-value scan passed: 272 tracked files, 326 nonignored
  candidates and 47 existing browser chunks; zero credential matches, local env
  ignored/untracked. No application build or full regression was rerun for this
  diagnostic-only script/documentation change; browser scan used existing output.
- Targeted Prettier check passed for `scripts/paypal-merchant-diagnose.ts`,
  `docs/paypal-merchant-rejection-report.md`, `docs/task-03c-checkout-report.md` and
  `HANDOFF-PAYPAL.md`; `git diff --check` passed.

Blocker/next step: inspect the original app's linked Sandbox Business seller,
verification/restrictions, USD receiving/country rules and separate Personal buyer;
use Dashboard logs/PayPal Developer Support to confirm the missing order's
disposition before any separately authorized financial action. No credentials,
configuration, identity, financial records, migrations or dependencies changed;
no replacement order, capture, release, deployment, commit or push occurred.

## 2026-10-27 — Task 03D: US merchant migration and preparation

Request: validate the newly configured US Sandbox app, preserve the unresolved
original checkout, implement audited operator handling and prepare an isolated
$10/$6 mandate/attempt; stop before new order creation. No original reservation
release or inferred non-capture from 404 is authorized.

- Reviewed active handoff and backend/client, owner auth, fixed checkout, SQL,
  atomic repository, test fixtures and secret-boundary tooling. The only local
  non-template environment file found is ignored `web/.env.local`; `.tools/`
  contains saved owner/session data and prior sanitized artifacts, not a documented
  original credential backup. No credential values were read into tool output.
- Added `scripts/paypal-us-preflight.ts` for read-only DB merchant/owner comparison,
  real Sandbox OAuth, supported identity discovery and original-order investigation
  only when explicitly available original credential variables match the saved
  app/merchant binding. New credentials must never be used to inspect the old order.
  No financial POST is allowed. Results and remaining changes will follow.
- Fresh US OAuth succeeded (HTTP200). Identity userinfo GET succeeded but returned
  only opaque `user_id`/`sub`, not a merchant/account/country/capability attestation.
  Configured new merchant differs from the persisted original; original credential
  variables are absent, so no old-order request was made with the US credentials.
  User explicitly confirmed Dashboard `Earmark US Test` links a US Business account
  whose Merchant ID matches local configuration. This is human confirmation, not
  independently verified receiving capability or API seller-identity proof.
- Implementation in progress: merchant-scoped `us-v1` mandate/purchase identity,
  separate port3031/session cookie and forced preparation-only actions in
  `test-config.ts`, `test-checkout.ts`, `test-auth.ts`, `test-http.ts`; added
  `operator-hold.ts` and append-only `postgres.ts` intervention (no old-row UPDATE),
  merchant-bound `service.ts`/`runtime.ts` guards including skip-without-mutation
  recovery, and preparation banner/disabled controls in `paypal-test.tsx` (all under
  `web/src/server/paypal/` except `web/src/components/paypal-test.tsx`).
- Updated `scripts/paypal-test-serve.ts` for the isolated preparation profile;
  added `scripts/paypal-us-prepare.ts` for real owner-authenticated hold/mandate/
  reserve only and preservation checks. Added package commands in `package.json`.
  Extended `scripts/paypal-secret-check.ts`, `scripts/check-web-boundary.mjs` and
  `.env.example` for optional securely retained original credential names.
- Added `web/test/paypal-us-migration.test.ts`; extended
  `web/test/fixtures/paypal-checkout.ts` and
  `web/test/paypal-database.integration.test.ts` for identity separation, denied
  financial actions, cross-merchant isolation and actual concurrent append-only
  hold verification. Validation and persistent preparation have not run yet.

### Final outcomes and additional file inventory

- Added `docs/task-03d-us-preparation-report.md`; updated `README.md` to replace the
  stale original-order approval instructions with the US preparation handoff and
  read-only commands. Updated `AGENTS.md` to preserve both mandates, require matching
  original credentials and enforce the current preparation-only stop point.
- Updated `scripts/paypal-test-status.ts` with `--us` / `paypal:us:status` and a
  merchant check before any provider request. Updated
  `scripts/paypal-merchant-diagnose.ts` to require the original app/merchant binding
  before any original-order request. Under US credentials, the legacy status
  command now fails as expected with `MATCHING_MERCHANT_CREDENTIALS_REQUIRED`;
  it does not query the old order. Original investigation remains blocked by absent
  original credentials, not misclassified as cancellation/non-capture.
- First actual preparation at `2026-10-27T00:41:45.812Z` authenticated the saved
  owner over real local HTTP, appended the original hold once, created US mandate
  **889b9c4a-b875-5de9-a354-18a037d41f52** and reserved US attempt
  **422ae62d-cd25-425f-9fdb-ce50ad6f0ffa**. New accounting is cap1000/reserved600/
  consumed0/available400 USD minor units, state RESERVED, no order or capture ID.
  Distinct merchant, mandate, purchase key and both durable request IDs verified.
  No PayPal request was made by the preparation script.
- Before/after financial snapshots prove the original mandate/attempt/merchant/
  idempotency rows (including update timestamps) unchanged. Original four audit
  rows remain byte-equivalent as projected; one append-only authenticated
  OPERATOR_RESERVATION_HELD decision records retention, no release authority and
  the immutable original merchant/order/amount. Replaying preparation at
  `2026-10-27T00:46:29.372Z` preserved both IDs/counters and added zero audit rows.
  Shared owner-auth file is unchanged. Combined reserved1200/recorded captured0
  across separate mandates is verified, not a transfer/reset of old headroom.
- The new loopback server remains running on port3031 with payments forced false,
  separate campaign cookie/epoch and a Dashboard-confirmation-bound profile.
  No payment-promotion flag exists. Fresh `paypal:us:status` independently read the
  new ledger as ACTIVE/RESERVED, order/capture null and no provider requests.
- New ignored local artifacts: `.tools/paypal-us-preflight.json`,
  `.tools/paypal-us-profile.json`, `.tools/paypal-us-server.json`,
  `.tools/paypal-us-server.log`, `.tools/paypal-us-prepared.json`,
  `.tools/paypal-us-ui-readonly.mjs`, `.tools/paypal-us-prepared-desktop.png`.
  Existing `.tools/paypal-test-auth.json` and original-order/status artifacts were
  preserved. Mocked UI screenshots `.tools/paypal-test-ui-mocked-desktop.png` and
  `.tools/paypal-test-ui-mocked-mobile.png` were refreshed and remain watermarked.
  Build/test caches/output stayed in this checkout (`agent/dist`, `web/.next`,
  TypeScript caches and disposable database schemas). No environment credential
  values, migration SQL, dependencies or original repository files changed.

### Fresh checks, failures and limitations

- `npm run paypal:test`: **178 mocked cases passed**, including **11 new migration
  security cases**; thirteen optional integrations skipped in that focused run.
  `npm run test --workspace @flint/web`: **351 passed**, eighteen skipped (12 PayPal
  DB, five original Monad DB, one optional OAuth Vitest case). Real US OAuth was
  verified separately by actual preflight calls, not counted as a Vitest case.
- `npm run paypal:test:db`: final **12 real PostgreSQL cases passed**, including
  concurrent merchant-isolated preparation and concurrent append-only hold tests.
  Initial run passed eleven/failed the new hold test because its fixture omitted
  the mandatory `createMandate` timestamp. TypeScript also caught that omission;
  fixed it without weakening checks and the full 12-case rerun passed. All test
  writes/cleanup were confined to generated session-owned schemas, never real
  demonstration rows. **363 distinct passed web/DB tests**; focused runs are not
  double-counted. Original Monad DB connections remained disabled; agent/Solidity
  suites were not rerun for these PayPal changes.
- Root agent/web/API `npm run typecheck` passed after the fixture correction.
  Strict standalone operational-script TypeScript then found an existing duplicate
  `status` field in launcher failure logging; changed the event label to `event`
  (only sanitized diagnostic output affected), and the strict check passed for all
  changed US/launcher/status/diagnostic/secret scripts. Final script checks follow.
- `npm run lint` (Biome warnings-as-errors for 222 code files plus Foundry format)
  and full `npm run format:check` passed. Existing informational style suggestions
  remain. Production `npm run build --workspace @flint/web` including agent build
  passed. Initial build invocation failed at the tool harness with an uninformative
  `ChildProcess.kill`; a separate full build succeeded with no application fix.
- Mocked checkout browser smoke passed. Actual US UI helper allowed only local
  owner login and GETs, blocked external requests and all other mutations, verified
  RESERVED and disabled order/approval/capture/cancel/recovery controls, no mobile
  overflow and no browser errors. No PayPal approval was automated.
- Credential scan passed before the final report: 272 tracked/330 candidate files,
  47 browser chunks, zero actual new/optional-original/test-auth secret matches.
  Browser variable boundary passed. Final scans/format results are recorded below.
- `npm run paypal:db:verify` passed read-only TLS/identity/schema/checksum/catalog
  and ledger checks. Two mandates/merchants/attempts, four idempotency rows, seven
  audit entries, zero webhook rows, original environment/history seed rows intact;
  no disposable schema or unrelated user table remains. Default backend/payment
  flags are false; only the local preparation process enables its constrained API.
- Source integrity verification passed: original HEAD/refs/status/diff and 305 file
  hashes unchanged. First invocation omitted required CLI arguments and exited
  with usage; corrected command passed. No original-resource mutation occurred.
- Latest binding-confirmation preflight at `2026-10-27T00:28:28.782Z`: real US OAuth
  HTTP200 debug `f320516e77d45`; Identity GET HTTP200 debug `f32051653b502` but only
  opaque IDs. Exact generic payment/orders scope checks were false; no conclusion
  about complete permissions or receiving eligibility follows. Partner capability
  status is not configured. Human seller confirmation is explicit; an actual
  API-returned payee match remains deferred until a separately authorized order.
- Final strict operational-script TypeScript and Biome warnings-as-errors passed
  after the status/diagnostic credential guards and reporting refinements. Final
  complete Prettier check and `git diff --check` passed. Final secret scan covered
  **272 tracked files / 331 candidates / 47 browser chunks**, zero credential
  matches, environment ignored/untracked; browser variable boundary passed again.
  No additional provider or financial calls were needed for these final checks.

Stop point: **US mandate/attempt prepared; no new order, capture, refund or payout**.
Next actions require account receiving/verification checks and explicit future
order authorization, followed by human Sandbox buyer approval and separately
authorized capture. Revalidate expiry then; do not reset old/new campaigns. The
old reservation requires independent authoritative resolution or explicit approval
of a documented risk decision. No Live call, deployment, commit or push occurred.

## 2026-10-27 — Task 03E: exactly one US Sandbox order

Request: create exactly one $6 USD Sandbox order for existing US mandate
`889b9c4a-b875-5de9-a354-18a037d41f52` / attempt
`422ae62d-cd25-425f-9fdb-ce50ad6f0ffa`; no approval automation, capture, cancellation,
refund/payout, reservation release or original-record changes. Read the required
instructions/handoff/Task03D report and current backend plus installed Next.js route
guide. User explicitly confirmed the US Personal buyer and Business seller are
different accounts; no buyer credentials were requested.

- Fresh real US OAuth HTTP200 and read-only Neon status show ACTIVE US mandate,
  RESERVED attempt, no order/capture, cap1000/held600/consumed0/available400 USD.
  Seller remains Dashboard-confirmed; userinfo still supplies opaque IDs only.
  Original credentials are absent; no original-order provider request was made.
- Added `web/src/server/paypal/us-order.ts` for exact prepared scope; updated
  `config.ts`, `client.ts`, `repository.ts`, `postgres.ts`, `service.ts` for an
  existing-reservation-only durable claim, prior-creation history rejection,
  one-order client permission, canonical GET and retention on every failure.
  No failed one-shot branch releases budget or retries a financial POST.
- Updated `test-config.ts`, `test-checkout.ts`, `test-http.ts`, `test-runtime.ts`
  under `web/src/server/paypal/` for operator-enabled exact-attempt `order-once`;
  all other US mutations stay blocked. Updated
  `web/src/components/paypal-test.tsx` for manual approval handoff without capture.
  Updated `scripts/paypal-test-serve.ts` for explicit `--us-order-once`, matching
  saved baseline, preserved owner and separate buyer confirmation. Extended
  `web/test/fixtures/paypal.ts` to model durable creation-history rejection.
  Preflight history checks, execution helper, tests and actual order are pending.
- Added `scripts/paypal-us-order.ts` and order check/create commands in
  `package.json`: read-only preflight snapshots/pins original rows+audit, owner,
  app/merchant and exact US record/history; one authenticated local submission
  only on `--create`, with no retry and preservation verification. Fresh check
  passed: active/unexpired, no prior order/capture/creation audit, two RESERVED
  idempotency rows, no identity collision and $6 held. Saved ignored baseline
  `.tools/paypal-us-order-baseline.json`; no financial request sent.
- Added `web/test/paypal-us-order.test.ts`; extended
  `web/test/paypal-database.integration.test.ts` with concurrent durable claim and
  rejection-retention/restart cases. Test/build validation is now in progress.
- Pre-dispatch checks passed: 200 mocked PayPal cases (22 new), 14 real disposable
  PostgreSQL cases (two new), full web 373 passed/20 integrations skipped; DB cases
  ran separately and original Monad DB remained disconnected. Root TypeScript,
  strict changed-script checks, Biome warnings-as-errors (225 files), full format/
  whitespace checks and production web+agent build passed. One non-failing Vite
  source-map warning occurred while parallel agent builds regenerated output;
  final build succeeded. No tests failed and no assertions/timeouts were weakened.
- Added verification mode to `scripts/paypal-us-order.ts`, safe approval-link
  availability projection to `scripts/paypal-test-status.ts`, and epoch/PID-bound
  US-server stop support in `scripts/paypal-test-serve.ts`. Stopped only the owned
  US preparation server, rebuilt, then started the preserved-owner port3031 server
  with exact `--us-order-once` permission. Ordinary payment settings remain false;
  only the separate scoped client can dispatch the one prepared order. Capture,
  reserve, mandate, cancel, recovery and original-hold HTTP mutations are blocked.
- Before dispatch, actual-value scan passed: 272 tracked/334 candidate files and
  47 browser chunks, zero credential matches; browser boundary and mocked UI smoke
  passed. No original data mutation or PayPal financial POST has occurred yet.

### Actual one-order outcome

Authorized creation completed at runtime UTC `2026-10-27T01:35:03.983Z`:
**US order 72936380818559054**, actual create HTTP200,
`PayPal-Debug-Id=f150642d8f8fe`. Exactly one local order submission, one durable
CREATE_PREPARED claim and one observed provider CREATE_ONE_ORDER POST. Existing
attempt and create/capture request IDs were reused; no second reservation/attempt
was created. Canonical order GET verified USD6.00, expected merchant/payee and
immutable references, PAYER_ACTION_REQUIRED and official Sandbox token link before
approval was exposed.

Independent `paypal:us:status` then confirmed PAYER_ACTION_REQUIRED, merchant match,
valid approval availability, no capture ID/status and US cap1000/reserved600/
consumed0/available400, AWAITING_APPROVAL/RESERVED, `objectiveComplete=false`.
`paypal:us:order:verify` confirmed one create claim/POST and byte-equivalent
original financial rows **and all original audit rows**, owner-auth file and US
request identities preserved. No original-provider read or original audit append
occurred in Task03E. Buyer approval and capture remain pending/not authorized here.

Generated ignored `.tools/paypal-us-order-result.json`,
`.tools/paypal-us-order-verification.json`,
`.tools/paypal-us-authoritative-status.json`; refreshed the US server metadata/log
and read-only US preflight artifact. Added ignored
`.tools/paypal-us-order-ui-readonly.mjs` to inspect the actual local handoff with
all external browser requests/non-login mutations blocked; UI result follows.

The one-shot allowance is consumed durably; the loopback server stays available
for authenticated saved-state/official-link access. Its ordinary payment switch
remains false; capture and all other US mutations remain blocked. No automated
buyer approval, capture, cancellation, release, refund/payout or Live call occurred.

### Final handoff documentation and checks

- Added `docs/task-03e-us-order-report.md`: exact authorization/scope, actual
  order/status/merchant/link evidence, accounting/preservation, verification,
  pending human steps and limitations. Updated `README.md` and `AGENTS.md` for the
  consumed one-shot permission and no further order/capture authorization. Added
  a superseding historical note to `docs/task-03d-us-preparation-report.md` and
  updated this handoff's current state. No earlier test result was silently changed.
- Actual local UI read-only inspection passed: AWAITING_APPROVAL, correct official
  link/token, create/capture/approval-verification/cancel/recovery controls disabled,
  zero browser errors/mobile overflow; no PayPal link/control clicked. Generated
  ignored `.tools/paypal-us-order-awaiting-desktop.png`; mock screenshot artifacts
  were refreshed by their separate watermarked smoke test.
- Independent read-only catalog verification passed at unchanged migration checksum:
  two mandates, two merchants, two attempts, four idempotency records, eleven audit
  entries, no webhook events; original seed/history rows intact, no disposable
  schema or unrelated user table remains. Four new US audit entries document
  authorization, dispatch claim, returned reference and canonical observation.
- Original source HEAD/refs/status/diff and 305 hashes remain unchanged. Foundry
  formatting passed. Across full web plus explicit DB runs: **373+14=387 distinct
  passed**, not double-counting 200 focused mocks; five legacy DB and optional OAuth
  Vitest case were not run. Real OAuth was checked independently by preflight.
  No tests/build/typecheck/lint failures occurred. Final documentation/credential
  scans and final formatting are recorded below.
- Final full Prettier and `git diff --check` passed after the report/current-state
  updates. Final actual-value scan: **272 tracked files / 335 candidates / 47
  browser chunks**, zero credential matches, environment ignored/untracked;
  browser server-variable boundary passed. No additional financial operation,
  deployment, commit or push occurred during final documentation checks.

## 2026-10-27 — Task 03F: read-only US buyer approval verification

Request: verify the human-completed checkout for existing US order
`72936380818559054` using actual Sandbox order/capture GET and real Neon reads;
assess readiness for separate capture authorization without enabling/executing it
or modifying financial records. Read `AGENTS.md`, `web/AGENTS.md`, this handoff and
Task03E report; inspected existing status/verification tooling and policy checks.

- Fresh `npm run paypal:us:status` reports **APPROVED**, USD6.00, actual configured
  merchant/immutable attempt reference match, **no capture ID/status**, and
  `humanApprovalStillRequired=false`. This is PayPal API evidence, not a browser
  redirect inference. Neon is ACTIVE, cap1000/reserved600/consumed0/available400,
  AWAITING_APPROVAL/RESERVED. No reconciliation writes were invoked.
- `npm run paypal:us:order:verify` passed read-only: one durable creation claim/
  observed original creation POST, original rows and all audit history unchanged,
  owner-auth file and request keys preserved. Its `approvalAvailable=true` is only
  the historical saved local approval URL; fresh API `approvalAvailable=false`
  after APPROVED is not a failure or reason to reapprove.
- Added ignored `.tools/paypal-us-approval-readonly.ts` for bounded read-only
  expiry/policy/capture-history and original baseline comparison. It never contacts
  PayPal or invokes a financial/reconciliation service. Results will follow.
  Existing status tools refreshed ignored `.tools/paypal-us-authoritative-status.json`
  and `.tools/paypal-us-order-verification.json`; no application/configuration
  source or financial records have been changed.

### Verified policy, preservation and readiness

Ignored read-only helper completed at database UTC **2026-10-27T01:53:40.399Z**:

- US mandate **889b9c4a-b875-5de9-a354-18a037d41f52**, attempt
  **422ae62d-cd25-425f-9fdb-ce50ad6f0ffa**, order **72936380818559054** match the
  saved owner, configured merchant, USD600-minor-unit terms and immutable request
  identities/fingerprint. Approved merchant policy contains exactly that merchant;
  per-transaction limit is600, cap1000, held600, consumed0, available400 USD minor
  units. Mandate is ACTIVE and unexpired until **2026-10-28T00:41:39.301Z**.
- **Zero CAPTURE_PREPARED audit events**, no CAPTURING/CAPTURE_UNCERTAIN/PENDING
  attempt and no local capture ID or remote error. PayPal order GET returned
  APPROVED with no captures, so no capture-ID GET was needed. No capture POST,
  order creation, cancel/release, refund or payout was attempted.
- Current saved local state remains AWAITING_APPROVAL/RESERVED. It is an unchanged
  historical observation, not contrary evidence to the fresh PayPal APPROVED GET.
  No `/approval`, `/recover`, payment-service reconcile or other financial-record
  write was invoked to synchronize it under this read-only authorization.
- Complete US and original financial/audit snapshots matched before/after the
  verification; original rows/audit also match the Task03E baseline. Original
  Nigerian reservation remains600, consumed0; no original-provider read occurred.
  Preserved owner-auth file and request IDs were not rotated or changed.
- **Ready to request separate explicit authorization for one controlled $6 capture**
  of this existing approved US order: actual approval/terms, policy, held budget,
  preserved capture identity and no prior/ambiguous capture are verified. This is
  not capture enablement or a guarantee of settlement. The present profile still
  blocks capture. A future authorized capture must freshly re-read approval,
  revalidate expiry/accounting, reconcile the saved approval state, and atomically
  claim the existing capture intent before dispatch; no new reservation/attempt.
- Refreshed ignored `.tools/paypal-us-approval-readiness.json` with sanitized
  readiness/preservation evidence. Added helper and earlier refreshed artifacts
  are the only local operational files touched; `HANDOFF-PAYPAL.md` is the only
  repository source/documentation file modified in Task03F. No app/dependency/
  configuration source, credentials, server profile or financial records changed.

Fresh checks: existing authoritative status and order/preservation verification
commands passed, as did the read-only expiry/history helper. No check failed.
Application tests/build were not rerun for read-only verification and this handoff
update; Task03E's regression results remain historical. Final documentation checks
are recorded below. Capture awaits **separate explicit user authorization**; no
deployment, Git commit/push or original-repository change occurred.

- Final `node node_modules/prettier/bin/prettier.cjs --check HANDOFF-PAYPAL.md`
  and `git diff --check` passed. No test/build was required or executed, no
  credential value/private customer data was included in this handoff, and no
  capture permission was enabled during documentation completion.

## 2026-10-27 — Task03G: one authorized US Sandbox capture

User explicitly authorizes at most one USD6 capture POST for existing approved US
order/mandate/attempt, subject to fresh checks; no new order, approval automation,
refund/payout, cancellation/release, Live, original-project or Nigerian-record
changes. Read AGENTS/web instructions, active handoff (including Task03F, which has
no standalone report), Task03E documentation, client/service/auth/repository and
installed Next.js Route Handler guide.

- Fresh actual `paypal:us:status` confirms APPROVED, USD6.00, matching merchant and
  attempt references, no capture; real Neon helper at **2026-10-27T02:01:11.085Z**
  confirms active/unexpired mandate, held600/consumed0/available400, zero capture
  claims/ambiguity, preserved owner and original rows/audit matching Task03E baseline.
- Added `web/src/server/paypal/us-capture.ts`; updated `config.ts`/`client.ts` for
  capture-only permission, exact scope and new-order/other-operation refusal.
  Updated `repository.ts`/`postgres.ts` for locked, history/idempotency-checked
  capture claims; `service.ts` adds existing-reservation-only one-shot capture with
  fresh approval/policy verification, canonical order+capture GET, existing atomic
  consumption only for COMPLETED, and held/review accounting on failure.
- Updated `test-config.ts`, `test-checkout.ts`, `test-http.ts`, `test-runtime.ts`
  under `web/src/server/paypal/` for explicit exact-capture-only loopback dispatch
  with unchanged owner/Origin/Host/CSRF security. Extended
  `web/test/fixtures/paypal.ts` for capture-history guards. No capture has been
  enabled or dispatched yet; operational preflight/execution helper and tests follow.
- Added `scripts/paypal-us-capture.ts` with read-only fresh PayPal/Neon check,
  binding-specific exclusive baseline, exactly one authenticated local execution
  submission and separate authoritative post-capture verification. Updated
  `scripts/paypal-test-serve.ts` for mutually exclusive `--us-capture-once`, exact
  baseline/owner/buyer bindings and child-only permission; normal payment flags
  stay false. Added check/execute/verify commands in `package.json`. Updated
  `web/src/components/paypal-test.tsx` to distinguish actual capture success from
  the earlier approval handoff. No capture POST has been sent.
- `paypal:us:capture:check` passed actual OAuth/Orders GET HTTP200, APPROVED/no
  capture, exact $6 scope, active/unexpired mandate, intact reservation, no capture
  claim and preserved original history/owner. Saved ignored
  `.tools/paypal-us-capture-baseline.json` using exclusive creation. No financial
  request or record mutation was made.
- Added `web/test/paypal-us-capture.test.ts`; extended
  `web/test/paypal-database.integration.test.ts` with concurrent canonical capture/
  one-consumption/restart and ambiguous POST retention cases. Tests use mocked
  PayPal and only the existing disposable PostgreSQL fixture, never persistent
  demonstration attempts. Validation is in progress before any capture enablement.
- Pre-execution validation passed: **229 PayPal mocks** (29 new capture cases),
  full web **402 passed/22 skipped**, and explicit isolated PostgreSQL **16 passed**
  (two new capture concurrency/restart/uncertainty cases). No tests failed; five
  original Monad DB cases and optional OAuth Vitest remain unrun. Actual OAuth and
  order GET are verified separately, not counted as extra Vitest cases.
- Root agent/web/API TypeScript, strict new operator/launcher TypeScript, Biome
  warnings-as-errors (228 files), full Prettier/whitespace and Foundry formatting
  passed. First production web build reached successful compile/typecheck/static
  generation but timed out at 300 seconds during trace collection; a separate full
  build completed successfully. No checks were weakened or app change needed.
- Before execution, scans passed for **272 tracked/338 candidate files/47 browser
  chunks**, zero actual credential matches and no browser server-variable leakage.
  Mocked checkout browser smoke passed; original source integrity still matches
  HEAD/refs/status/diff and 305 hashes. Stopped only the epoch/PID-verified owned US
  server before rebuilding; original checkout/repository untouched.
- Fresh final read-only capture preflight again passed OAuth/Orders GET HTTP200,
  APPROVED, exact seller/USD6, active unexpired mandate, held600/consumed0, no prior
  capture claim and original history intact. Its order GET debug ID is
  `ca50e4cd0b8b6`. No capture POST sent yet; exact scoped server enablement follows.

### Actual authorized capture and independent verification

The loopback server started with mutually exclusive capture-only permission, normal
payment settings false, existing owner/session security and exact saved baseline.
One operator submission completed at runtime UTC **2026-10-27T02:36:33.225Z**:
order **72936380818559054**, capture **52C23729CU714125M**, local SUCCEEDED/CONSUMED,
held0/consumed600. No other payment/order was requested.

Independent `paypal:us:capture:verify` completed at **2026-10-27T02:37:08.804Z**:
PayPal order **COMPLETED**, capture **COMPLETED**, final capture true, USD6.00,
matching canonical seller/order/attempt/currency/amount. Actual capture POST was
**HTTP201**, `PayPal-Debug-Id=ca50e501abb92`. Fresh verification GET_ORDER HTTP200
debug `ca50e512aafa0`; GET_CAPTURE HTTP200 debug `ca50e512e49cc`.

Fresh read-only PostgreSQL transactions verify cap1000/consumed600/reserved0/
available400 USD minor units, exact capture ID accepted once, one CAPTURE_PREPARED
claim, one observed CAPTURE_ONE_ORDER POST and one completed ledger observation.
Original Nigerian rows **and all original audit history** match the Task03E
baseline; its unresolved reserved600 is unchanged. Preserved owner-auth file,
merchant/purchase identities and existing capture request ID are unchanged.

A second independent `paypal:us:status` confirms order/capture COMPLETED,
SUCCEEDED/CONSUMED, $6 spent/$0 held/$4 available and `objectiveComplete=true`.
These are actual API/database reads, not UI/HTTP-success-only claims. No second
capture submission was made to test duplication: isolated concurrency/restart/
terminal replay tests plus durable claim/reference/accounting reads prove the
duplicate guards without paying again. The exact capture allowance is spent.

Generated ignored `.tools/paypal-us-capture-result.json` and
`.tools/paypal-us-capture-verification.json`; refreshed the authoritative US status
artifact and US server metadata/log. Added ignored
`.tools/paypal-us-capture-ui-readonly.mjs` for saved-state-only UI inspection,
blocking external requests and every non-login mutation. UI/catalog results and
final report/documentation checks follow. No original-provider API call, capture
retry, new order, refund/payout, cancellation or unrelated release occurred.

### Final documentation, UI and database handoff

- Added `docs/task-03g-capture-report.md`: actual receipt/API debug evidence,
  policy/scope, final accounting, old-history preservation, replay behavior,
  verification results/build timeout and operational limitations. Updated
  `AGENTS.md` and `README.md` for consumed permissions and verified controlled
  Sandbox success, and `docs/task-03e-us-order-report.md` with a historical
  superseding note. Updated this handoff's current state; earlier results remain
  chronological rather than silently rewritten.
- Actual read-only capture UI check passed: SUCCEEDED, exact capture ID, $6 spent/
  $0 held/$4 available, all payment controls disabled, no mobile overflow/browser
  errors. Only local login/GETs were allowed; external requests and every other
  mutation were blocked. Generated ignored
  `.tools/paypal-us-capture-completed-desktop.png`. Mocked UI screenshots were
  refreshed separately and retain their mock-only watermark.
- Read-only database catalog/ledger verification passed after capture: unchanged
  approved migration checksum, two mandates, two merchants, two attempts, four
  idempotency rows, **15 audit entries**, no webhook events, original environment/
  history seeds intact, no disposable schemas/unrelated user tables. Four new US
  audit rows record capture authority, durable claim, verified capture reference
  and completed accounting observation; no old row/audit was overwritten.
- Changes used existing dependencies/schema and server credentials. No environment
  credential values, original auth file, migration SQL or dependencies changed.
  Ignored artifacts additionally include capture baseline/result/verification
  JSON and UI helper/screenshot; US server metadata/log and authoritative status,
  initial read-only approval-readiness artifact and normal local build/test caches
  were refreshed only in this checkout. No capture failure/retry occurred.
- Final report formatting/credential-boundary checks follow. There is no blocker
  to Task03G's completed-payment success criteria. Separate project limitations
  remain original Nigerian obligation resolution, real webhook delivery and future
  production/auth/refund/dispute work. No additional payment, Live operation,
  original-repository write, deployment, commit or push is authorized/performed.
- Final complete Prettier and `git diff --check` passed after receipt/current-state
  documentation. Final actual-value scan passed for **272 tracked files / 339
  candidates / 47 browser chunks**, zero raw/encoded credential matches, local env
  ignored/untracked; browser server-variable boundary passed. These final checks
  made no further provider financial request or financial-record mutation.

## 2026-10-27 — Task 04: Gemini AI Agent + PayPal Authorization Integration

### Request

Integrate a real Gemini-powered purchasing agent with Earmark's existing server-side policy engine and PayPal-backed payment workflow (`authorize` + `PayPalPaymentService.reserve`), expose a bounded 5-tool schema, integrate the workflow into the Earmark execution console, enforce the payment execution boundary (no new PayPal order, approval, capture, release, refund, or payout), run full security and database validation, document every change in `HANDOFF-PAYPAL.md`, and write `docs/task-04-gemini-integration-report.md`.

### Added and modified files

- `agent/src/models.ts`: Extended `GeminiSettings` with optional `systemInstruction?: string` and `customTools?: readonly CustomToolDefinition[]`. Extended `GeminiModel.decide` so it supplies `customTools` (converted to Gemini `functionDeclarations`) and `systemInstruction` to `POST /v1beta/models/{model}:generateContent` when provided, while falling back to the 8 legacy EVM tool declarations when `customTools` is omitted. Exported `CustomToolDefinition`.
- `agent/src/server.ts`: Exported `CustomToolDefinition` and `AgentDecision` for server-side consumers.
- `agent/src/index.ts`: Re-exported `CustomToolDefinition`.
- `agent/test/gemini.test.ts`: Added 3 unit tests covering `GeminiModel` custom tool schema declarations, custom `systemInstruction`, multi-turn history serialization, and custom tool call dispatch (`34` total passing tests in file).
- `web/src/lib/paypal-agent.ts` (**added**): Client-safe shared types and scenario catalog metadata (`PayPalAgentScenarioId`, `PayPalAgentExecutionMode`, `PayPalMerchantOfferView`, `PayPalOfferComparisonItem`, `PayPalPolicyCheckView`, `PayPalAgentTraceStep`, `PayPalAgentProposalView`, `PayPalAgentEvaluationResult`, and `PAYPAL_SCENARIO_CATALOG_META` for scenarios `P1`–`P7`) with zero server credential identifiers.
- `web/src/server/paypal/agent.ts` (**added**): Server-only PayPal Gemini purchasing agent workflow:
  - 5 strict `z.strictObject` tool schemas and Gemini function declarations (`readSpendingMandate`, `listApprovedMerchants`, `compareEligibleOffers`, `proposePurchase`, `readAuthorizedPaymentStatus`).
  - Explicit blocklist for forbidden operations (`FORBIDDEN_AGENT_TOOL` for `createOrder`, `captureOrder`, `approveOrder`, `approvePayment`, `releaseReservation`, `issueRefund`, `createPayout`, `overridePolicy`, `createMerchant`, `queryDatabase`, `getPayPalAccessToken`).
  - Sensitive material payload scanner (`assertNoSensitiveMaterialInAgentPayload`) preventing secret variable names, `Bearer` tokens, `postgresql://` connection strings, and `/v2/checkout/orders/.../capture` endpoints from entering model prompts or tool observations.
  - `PayPalAgentProposalService` connecting proposals to canonical `authorize`, `requireIdentity`, and `PayPalPaymentService.reserve` inside isolated evaluation mandates (`IsolatedAgentPaymentRepository` or disposable PostgreSQL schema), blocking reuse of historical mandates (`889b9c4a-b875-5de9-a354-18a037d41f52` and `8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064` with `COMPLETED_MANDATE_REUSE_FORBIDDEN`) and blocking all payment execution methods (`AGENT_PAYMENT_EXECUTION_DISABLED`).
  - `runPayPalPurchasingAgent` and `evaluatePayPalAgentScenario` supporting `mode: "gemini"` (real `GeminiModel` `:generateContent` inference that fails closed with `GEMINI_DISABLED` / `MISSING_MODEL_CONFIGURATION` when unconfigured and never substitutes the deterministic mock adapter) and `mode: "deterministic-policy"` (explicitly labeled `DETERMINISTIC_POLICY_SIMULATION`).
- `web/src/app/api/paypal/agent/route.ts` (**added**): Next.js `GET` and `POST` Route Handlers for `/api/paypal/agent` with strict Zod query/body validation, per-mode rate limiting, and `Cache-Control: no-store`.
- `web/src/components/gemini-console.tsx`: Added `PayPalAgentConsole` and the `"PayPal Agent · Policy"` mode button inside `ExecutionWorkspace` while preserving `"Demo Mode"` (scenarios `A`–`D`) as initial default and preserving `"Live Gemini"`.
- `web/test/paypal-gemini-agent.test.ts` (**added**): 14 unit and security tests covering real `GeminiModel` `:generateContent` multi-turn tool execution (`P1` and `P6`), prompt injection in merchant descriptions (`P2`), malicious tool-call arguments and forbidden tools, unauthorized merchant (`P3`), budget exhaustion (`P4`), expired/revoked mandates (`P5`), currency mismatch (`P7`), fabricated delivery claims, duplicate and concurrent proposals, model timeout / malformed JSON, missing Gemini credentials fail-closed behavior, payment execution boundary enforcement, and historical mandate reuse rejection.
- `web/test/paypal-database.integration.test.ts`: Added real PostgreSQL disposable-schema integration test verifying concurrent Gemini agent purchase proposals under `SELECT ... FOR UPDATE` row locking (`$6.00` + `$6.00` against `$10.00` cap reserves exactly `$6.00` once and rejects the second with `CAP_EXCEEDED`, with `0` provider order/capture calls).
- `docs/task-04-gemini-integration-report.md` (**added**): Comprehensive Task 04 deliverable report covering all 9 required sections.
- `HANDOFF-PAYPAL.md`: Updated current project state, appended this Task 04 log entry, and linked `docs/task-04-gemini-integration-report.md`.

### Behavior and compatibility effects

- Preserves all legacy Monad EVM contracts, agent workflows, recorded demo scenarios (`A`–`D`), and live EVM console modes without behavioral regression.
- Preserves Task 03G completed US payment records (`72936380818559054` / `52C23729CU714125M`, `COMPLETED`, `consumed = 600`, `reserved = 0`, `available = 400`) and the unresolved Nigerian mandate (`8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064`, `reserved = 600`) completely untouched.
- Zero PayPal API calls or persistent Neon database writes are triggered by the Gemini agent workflow.

### Checks run and results

- `npm run typecheck`: **PASSED** (0 errors across `@flint/agent`, `@flint/web`, and `api`).
- `npm run test --workspace @flint/agent`: **PASSED** (`8` test files, `142` passed tests, including `34` in `agent/test/gemini.test.ts`).
- `npm run paypal:test`: **PASSED** (`13` passed test files, `2` skipped integration files, `243` passed tests including `14` in `web/test/paypal-gemini-agent.test.ts`).
- `npm run paypal:test:db`: **PASSED** (`17/17` real PostgreSQL integration tests in `web/test/paypal-database.integration.test.ts` using a disposable schema; `disposableTestSchemasRemaining: 0`).
- `npm test`: **PASSED** (Foundry contract suites + `142` `@flint/agent` tests + `416` `@flint/web` tests passed, `0` failed).
- `npm run lint`: **PASSED** (`biome lint . --error-on-warnings` and Foundry lint exited 0).
- `npm run format:check`: **PASSED**.
- `npm run build`: **PASSED** (Next.js 16.4.3 production build succeeded including `/api/paypal/agent`).
- `node scripts/preview-smoke.mjs`: **PASSED** (`8` production routes, four recorded scenario controls, Sandbox status, mobile layout, and zero browser exceptions).
- `node scripts/check-web-boundary.mjs`: **PASSED** (`48` compiled JavaScript chunks contain no server credential variable names or private-key PEM material).
- `npm run paypal:secrets:check`: **PASSED** (`trackedFilesScanned: 339`, `candidateFilesScanned: 344`, `browserChunksScanned: 48`, all credential matches `0`, `localEnvironmentIgnored: true`).
- `npm run paypal:db:verify`: **PASSED** (`PAYPAL_DATABASE_STRUCTURE_VERIFIED`, `approved_merchants: 2`, `attempts: 2`, `audit: 15`, `environment: 1`, `idempotency: 4`, `mandates: 2`, `schema_migrations: 1`, `webhook_events: 0`, `disposableTestSchemasRemaining: 0`).
- `npm run paypal:us:status`: **PASSED** (`orderId: "72936380818559054"`, `captureId: "52C23729CU714125M"`, `COMPLETED`, `authorizedMinor: "1000"`, `reservedMinor: "0"`, `capturedMinor: "600"`, `availableMinor: "400"`, `paymentMutationRequests: 0`).
- `node scripts/source-integrity.mjs verify ..\project-flint .tools\source-integrity.json`: **PASSED** (`PASS: source HEAD, refs, status, diff and 305 file hashes unchanged`).

### Known limitations and blockers

- No implementation blockers for Task 04.
- Local `.env.local` / `web/.env.local` does not configure `GEMINI_API_KEY`, `EARMARK_GEMINI_ENABLED`, or `AI_ENABLE_NETWORK`; therefore live external network calls to `generativelanguage.googleapis.com` were not executed and `mode: "gemini"` fails closed with `GEMINI_DISABLED` / `MISSING_MODEL_CONFIGURATION` until operator credentials are supplied.
- Merchant offers in the agent catalog are synthetic demonstration fixtures; no real merchant procurement or new PayPal order/capture execution is enabled or claimed.

## 2026-10-27 — Task05A: PARTIAL — owner-gated preparation complete, live key deferred

Request: actual Gemini inference over synthetic $6 offers/$10 test budget, independent
policy validation and durable checkout intent awaiting human authorization, with no
new PayPal operation or model-triggered persistent financial reservation. Read root/
web instructions, current handoff/Task04 report, Gemini adapter, agent tools, payment
policy/service, PostgreSQL, local owner session/CSRF/Origin/Host gates and installed
Next.js Route Handler guide. Preserve both historical mandates and all user work.

- Added ignored `.tools/task05a-env-probe.ts` to inspect configured credential/flag
  presence only; it never prints credentials or contacts external services.
- Fresh Git inspection shows checkpoint **723662b** (PayPal integration through
  Task03G) plus uncommitted Task04 changes. The earlier summary's aa69c9b-only
  statement is historical/outdated; no commit/fetch/push is performed by this task.
- Inspection found Task04's public GET/POST route can invoke Gemini without owner
  authentication once credentials are enabled, and its proposals reserve only in
  isolated evaluation contexts. Task05A will keep public deterministic scenarios,
  gate actual inference/preparation behind preserved local-only authentication,
  and prevent model proposals from reserving persistent funds. Implementation and
  actual live credential checks follow.
- Presence-only probe found no Gemini key/model/enable flags. User explicitly
  directed **continue without the live key; they will add it later**, and requested
  this blocker in the summary. No live inference/API call is made or claimed;
  Task05A's live success criterion must remain partial until actual validation.
- Added `web/src/lib/agent-checkout.ts`,
  `web/src/server/paypal/agent-checkout-config.ts`, `agent-checkout.ts`,
  `agent-checkout-postgres.ts`, `agent-checkout-http.ts`: new owner-scoped $10/$6
  preparation campaign, strict synthetic canonical terms, proposal-only Gemini
  tool execution, independent policy revalidation, pending intent immutable hash/
  durable identity and append-only existing-audit storage with no financial attempt
  or reservation. Session advisory locking and durable run markers prevent
  duplicate inference/preparation across concurrent requests/restarts. No migration
  or schema change is needed. Preparation requires authenticated owner actions.
- Updated `web/src/server/paypal/test-auth.ts` to reuse existing local auth with
  typed profile config and separate agent cookie; prior checkout profile/cookies
  retain their behavior. Updated `agent.ts` for explicit proposal-only mode and
  detached catalog copies. Closed unauthenticated Gemini inference in
  `web/src/app/api/paypal/agent/route.ts`; public deterministic scenarios remain.
- Added `web/src/app/api/paypal/agent-checkout/route.ts` and `[action]/route.ts`,
  and `web/src/components/agent-checkout.tsx`; updated `gemini-console.tsx` to route
  its live PayPal mode through owner/session/Host/Origin/CSRF-protected preparation
  with explicit evaluation/proposal/policy/human-authorization/not-executed stages.
  Added `scripts/paypal-agent-serve.ts` and `paypal-agent-prepare.ts`, package
  commands and Gemini-value checks in `scripts/paypal-secret-check.ts`. New
  loopback profile is port3032, all financial mutations disabled, not production
  authentication; no persistent reservation path is exposed. Validation follows.
- Added `web/test/fixtures/agent-checkout.ts` and
  `web/test/paypal-agent-checkout.test.ts` for explicitly mocked native Gemini
  protocol, proposal-only behavior, canonical price/currency/merchant/commitment
  tampering, hostile descriptions/tools/arguments, historical mandate exclusion,
  authentication/CSRF/Host/Origin, cross-profile cookies and missing-key fail-closed
  behavior. Extended `web/test/paypal-database.integration.test.ts` with real
  disposable-schema concurrent preparation, durable intent replay and commit-time
  revalidation/zero-reservation checks.
- Initial typecheck identified exact-optional-field output types in new Zod
  schemas; normalized absent fields without weakening TypeScript. Subsequent root
  typecheck and strict new-script checks passed. First focused PayPal run passed
  257 mocks (before the additional cookie test); external integrations stayed
  opt-in. No live inference occurred. Ignored `.tools/task05a-history.ts` recorded
  readonly hashes/counters for both historical mandates and the owner auth file,
  in `.tools/task05a-history-baseline.json`, before any new initialization.
- Final regression passed: **176 Solidity + 142 agent + 431 web = 749 cases**;
  explicit disposable PostgreSQL **19/19 passed**, including both new checkout
  metadata tests. **768 distinct workspace/DB tests passed** without counting
  focused reruns twice; all 15 new preparation tests passed in the full web run.
  Five legacy DB and optional OAuth Vitest cases were not run; no live model call
  or PayPal payment was part of these tests. No test failed. Full formatting and
  whitespace checks passed. Local main and stored origin/main both resolve to
  **723662b**; no remote fetch/publication occurred.
- Added `web/src/app/agent-checkout/page.tsx` as a direct entry to the same protected
  preparation UI, after reading the installed page guide; corrected the operator
  launch URL to `/agent-checkout` (execution detail pages do not host the console).
  Production build, credential boundaries, actual blocked-state UI and owner-
  authenticated zero-reservation initialization are the remaining checks.
- Root production build passed (contracts/agent/Next.js), with only inherited
  Solidity notices; source-integrity verification still matches 305 original hashes.
  New local profile started on **http://127.0.0.1:3032/agent-checkout**, key absent,
  all payment/reservation execution disabled. Real owner-authenticated initialization
  at **2026-10-27T19:40:26.683Z** created new mandate
  **598f50eb-325a-5df3-af67-9c629973bafb**, cap1000/reserved0/consumed0/available1000
  USD minor units, expiry **2026-10-28T19:40:23.661Z**. No actual model proposal or
  checkout intent exists yet (`NOT_STARTED`, `MISSING_MODEL_CONFIGURATION`).
- Actual live-command negative check returned expected missing-key error before
  any Google call/run marker. Read-only catalog verification passed: three mandates/
  merchant rows, two historical attempts, four historical idempotency rows, 16 audit
  entries (only one new MANDATE_CREATED), no schema changes/disposable schemas.
  Both historical financial/audit snapshots and owner auth still match baseline.
- Added ignored `.tools/task05a-ui.mjs` to inspect actual key-blocked UI and a
  separately watermarked mocked pending-intent lifecycle, with external requests/
  financial mutations blocked. Actual blocked-state view passed; initial mocked
  mobile view exposed a long disabled button overflow. Fixed text wrapping only
  in `web/src/components/agent-checkout.tsx`; web rebuild/UI rerun follows.

### Final preparation, checks and remaining blocker

- Final web production rebuild passed after the text-wrap fix. Restarted only the
  owned port3032 process, preserving local owner/profile/mandate identities and
  leaving its Gemini/network flags false because the key is absent. Actual blocked
  UI and separately watermarked mocked pending-intent lifecycle both passed, with
  no browser errors/mobile overflow and no external/financial request allowed.
- Eight-route legacy preview smoke passed. Fresh `paypal:us:status` actual API GET
  confirmed original US order/capture COMPLETED, consumed600/reserved0/available400;
  it made no financial request. History helper confirms both historical financial/
  audit snapshots and owner auth unchanged. Original repository integrity remains
  HEAD/refs/status/diff plus 305 hashes matched; no old checkout/environment change.
- Added `docs/task-05a-agent-checkout-report.md`: explicit PARTIAL result and user
  key deferral, no fabricated live evidence, actual new zero-funded preparation,
  native mocked protocol/tool results, independent policy/audit/idempotency design,
  UI/auth boundaries, exact tests/fixes and future key/payment requirements.
  Updated `README.md`, `AGENTS.md` and this handoff's current-state summary for the
  port3032 prototype, no model-triggered reservation/production-auth claim and
  pending actual Google validation. Corrected current Git summary to locally
  verified checkpoint723662b, preserving historical entries.
- Ignored operational/evidence paths created or refreshed in Task05A:
  `.tools/task05a-env-probe.ts`, `.tools/task05a-history.ts`,
  `.tools/task05a-history-baseline.json`, `.tools/task05a-ui.mjs`,
  `.tools/paypal-agent-server.json`, `.tools/paypal-agent-server.log`,
  `.tools/paypal-agent-preparation.json`, `.tools/agent05a-actual-key-blocked.png`,
  `.tools/agent05a-mocked-pending-intent.png` (mock-only watermark), legacy preview
  screenshots and readonly `.tools/paypal-us-authoritative-status.json`.
  Existing auth/US profile files and original financial records were not modified.
  Normal build/test caches were refreshed only in this checkout. No migration,
  dependency/lockfile, credential value, original-source file, deployment, commit
  or push was changed.
- Final code checks passed: root TypeScript and strict new-script checking; Biome
  warnings-as-errors for244 files (before standalone page) and Foundry formatting.
  Root test and isolated DB runs passed all768 distinct cases. Initial TypeScript
  optional-field issue and pending-UI overflow were corrected without weakened
  checks; the actual missing-key rejection is an expected blocked negative check.
  Final formatting/credential scans follow, after receipt documentation.

**Remaining blocker:** user must add the server-side Gemini key and supported model,
restart only the owned agent profile and perform actual authenticated inference.
No model-generated live recommendation or persisted live pending intent is claimed.
Task05A remains PARTIAL until that success criterion is actually verified. Even
afterward, owner fund authorization/reservation and any new PayPal order/buyer
approval/capture require a separate explicitly authorized task; the current
workflow has no such financial execution path.

- Final security review added the shared Sandbox environment/origin/flag validator
  to `web/src/server/paypal/agent-checkout-config.ts`, so the preparation profile
  explicitly rejects Live configuration and malformed payment flags despite having
  no payment transport. Extended the existing config assertions in
  `web/test/paypal-agent-checkout.test.ts`; targeted tests/build/UI are rerun for
  this final guard. Fresh presence probe still reports no Gemini key/model, as
  explicitly deferred by the user.
- The final Sandbox-guard assertions passed in the 15-case targeted preparation
  suite; complete web build/typecheck and actual blocked/mocked-pending UI checks
  passed again after restarting the owned agent server. Key remains absent;
  no model or payment was invoked. Final Biome/format/secret checks are recorded
  below; the task remains explicitly PARTIAL only for deferred live validation.
- Final Biome warnings-as-errors passed for **245 files**; full Prettier and
  `git diff --check` passed. Final actual-value scan covered **339 tracked files /
  358 candidates / 51 browser chunks**, zero credential matches and private env
  ignored/untracked; browser-variable boundary passed. Final read-only history
  comparison still matches both old ledgers/audits and owner auth exactly. No new
  Google call or financial operation was made during these final checks.

## 2026-10-28 — Task05A INVALID_MODEL_RESPONSE diagnosis and fix

Request: trace live Gemini failure, verify environment loading without exposing
values, run one controlled diagnostic and one post-fix inference if available,
preserve strict proposal validation and add regressions. No PayPal request,
financial reservation, database mutation, deployment, commit or push is authorized.
Read root/web instructions, active handoff, Task05A report, launcher, preparation
CLI, Gemini adapter and purchasing runner. Existing Task04/05A changes are user
work and remain preserved. The ordinary live CLI initializes/persists evaluation
metadata, so diagnostics use a separate read-only/in-memory path instead.
Initial generic shell/file-reader calls timed out; explicit Windows shell paths
restored access. Results and complete affected-file inventory follow.

### Confirmed diagnosis, changes and live results

- Corrected the stale current-state key blocker: the user has now supplied
  server-side key/model configuration. Presence/equality checks match web/.env.local;
  no values were printed or modified. Configured model metadata supports
  generateContent (HTTP200); actual native tool calls establish function-calling
  compatibility. No model fallback/substitution was used.
- Error origin: paypal-agent-prepare.ts relays the protected evaluation error.
  inferPendingAgentIntent -> purchasing runner -> GeminiModel.decide originally
  passed Markdown-fenced finish text straight to JSON.parse and collapsed its
  syntax error into INVALID_MODEL_RESPONSE. Real synthetic reproduction returned
  five valid native calls, then HTTP200/one candidate/STOP with a single fenced
  strict finish object (240-character summary). No API/auth/quota, safety,
  truncation or tool-schema failure occurred. The user's historical raw response
  was not captured, so this is an actual matching reproduction, not a claim to
  have inspected that original payload.
- Added agent/src/gemini-response.ts and
  agent/test/gemini-response.test.ts. Parser strips only one complete JSON/
  unlabelled code fence around a strict finish object, never repairs JSON or
  accepts text-encoded tools, extra fields, prose or invalid proposals. Bounded,
  sanitized metadata distinguishes response failure categories. Regressions cover
  unknown/multiple calls, strict arguments, truncation/safety/JSON/schema failure,
  rejected-state safety, exact native IDs/opaque thought signatures/part order and
  the live-reproduced fence. Updated agent/src/models.ts to use this parser and
  install pending tool state only after validation; corrected its misleading
  sampling-parameter comment. Updated agent/src/server.ts to export diagnostics.
- Updated web/src/server/paypal/agent.ts instruction to request one tool at a time
  and raw finish JSON, retaining every purchase/policy schema. Updated
  web/test/paypal-agent-checkout.test.ts with the complete native mocked fenced-
  finish -> independent policy -> zero-reservation regression. The existing
  adapter already preserved signed raw model content/call IDs; new tests verify
  that behavior, not a fabricated signature fix.
- Added scripts/paypal-agent-diagnose.ts: --environment, --probe and --verify,
  official endpoint-only, explicit bounded synthetic fixtures, safe classifications
  and no DB/auth-profile/PayPal calls. scripts/paypal-agent-prepare.ts was inspected
  but unchanged and not executed: it initializes/persists markers, forbidden here.
- Added docs/task-05a-gemini-diagnosis.md and updated this handoff's current summary,
  chronological log and next steps. These are the only documentation changes in
  this session; earlier Task04/05A history and pre-existing changes are preserved.
- Automatic approval review rejected the initial real-mandate diagnostic for
  exporting potentially sensitive observations to Google. User explicitly chose
  synthetic diagnostic data only. The rejected command sent nothing. Revised
  diagnostics have no actual owner, merchant, DB rows or real catalog inputs.
  Initial generic shell/Node sandbox access failed; explicit Windows shell paths
  and reviewed Node commands restored execution without changing system settings.
- Actual Google totals: 3 authenticated metadata GETs, 13 generateContent POSTs
  (one capability probe, six-turn pre-fence-fix reproduction and one six-turn
  final post-fix run). All HTTP200; each generation had one candidate, STOP,
  null API/block category; every native argument schema was valid. Five tool
  names in each full run: readSpendingMandate, listApprovedMerchants,
  compareEligibleOffers, proposePurchase, readAuthorizedPaymentStatus.
- Final live run returned LIVE_SYNTHETIC_PROPOSAL_POLICY_VALIDATED: canonical $6
  USD offer under synthetic $10 mandate passed independent identity/merchant/
  budget/currency/commitment/objective and immutable-intent policy. Final finish
  was strict unfenced JSON (206-character summary). No actual-owner approval or
  real procurement is implied. No live pending intent was persisted.
- Ignored sanitized evidence created:
  .tools/paypal-agent-diagnostic-probe.json,
  .tools/paypal-agent-diagnostic-reproduction.json,
  .tools/paypal-agent-diagnostic-verify.json. They contain only status/category/
  counts/known tool names/booleans/lengths; no raw prompts, responses, argument
  payloads, opaque signatures, credentials or auth headers.
- Check results so far: focused Gemini 65 passed; PayPal web259 passed/20 opt-in
  DB+OAuth skipped; root TypeScript and strict standalone diagnostic TypeScript
  passed. Initial broad agent run134 passed but failed when Anvil beforeAll
  timed out, skipping29 integration cases. Initial lint's one untyped variable
  was fixed; full lint/Biome 248 files and Foundry fmt now pass. Final integration
  retry, build, format and secret-scan outcomes follow.
- No database connection/write/reservation, PayPal request, original-source edit,
  credential/dependency/lockfile change, server restart, deployment, commit or push
  occurred. Prior financial/audit/source-integrity measurements are historical;
  no fresh database/PayPal/original-checkout verification is claimed.

### Final verification and remaining work

- Focused agent Gemini tests: 65 passed (34 existing + 31 new).
- PayPal web regression command: 259 passed, 20 opt-in DB/OAuth cases skipped.
  Additional shared Gemini web session command: 30 passed (overlaps 14 PayPal cases;
  do not add the command totals as a unique-test count).
- Isolated local EVM integration retry: 29/29 passed after the earlier Anvil startup
  timeout. The original broader command remains recorded as failed; no assertion
  or timeout was changed to obtain the successful isolated retry.
- Root npm run typecheck and strict standalone diagnostic TypeScript passed.
  Root npm run build passed for contracts, agent and Next.js production, with only
  inherited Solidity lint notices. Full npm run lint passed (Biome 248 files and
  Foundry fmt). Full npm run format:check and git diff --check passed.
- Existing paypal:secrets:check passed: 339 tracked files/362 candidates/51 browser
  chunks, zero actual credential matches, local environment ignored/untracked and
  no values printed. check-web-boundary passed for 51 production chunks.
- Normal ignored generated artifacts were refreshed in agent/dist/, web/.next/
  and web/tsconfig.tsbuildinfo; no source-repository artifacts were generated.
  All 9 session source/test/script/documentation paths are explicitly listed above,
  plus the three ignored sanitized diagnostic reports. No file was deleted/moved.
- Remaining operational limits: no actual-owner campaign inference/intent or
  database state was verified here, no server restart performed. Before an
  authorized durable retry, inspect original failure marker and immutable mandate
  expiry; never reset journals/authority. Actual owner consent and any financial
  execution remain separate future work. Diagnosis/fix and synthetic live policy
  verification are complete within this task's restrictions.

## 2026-10-28 — Task05B restore application inference and review durable recovery

Request: inspect the owned port3032 server and campaign, load the corrected build,
run one genuine synthetic inference through the authenticated local application,
and document safe durable recovery without changing financial history. Read root/
web instructions, current handoff/Task05A diagnosis, launcher/environment/profile,
owner HTTP gates, UI and PostgreSQL failure/expiry/idempotency rules. Existing
uncommitted work is preserved. No payment or new persistent campaign authority is
authorized. Actual read-only state, file inventory and validation results follow.

### Reviewed state, changes and restoration results

- Verified existing listener PID 7072 and saved server epoch. The source parser has
  the Task05A fenced-finish fix; previous tests alone did not prove the old running
  process loaded it. Inspected installed Next Route Handler/environment guides and
  signal-cleanup implementation before changes. The actual persisted campaign
  remains FAILED/INVALID_MODEL_RESPONSE, STARTED+FAILED audit events, no intent,
  ACTIVE and unexpired until 2026-10-28T19:40:23.661Z; reserved0/consumed0/available1000.
  Current replay guards cannot resume it. No reset/revocation/extension was made.
- Added scripts/paypal-agent-inspect.ts for dedicated TLS/identity-verified
  REPEATABLE READ READ ONLY inspection, every-row fingerprints across all 8 tables
  and owner-file hash comparison. Counts are 3 mandates/merchant rows, 2 attempts,
  4 idempotency rows and18 audit rows. The previously recorded 16 was before the
  user's later failed run; its 2 start/failure events are now freshly observed.
- Added web/src/server/paypal/agent-diagnostic.ts for a separate explicit synthetic
  owner/merchant/mandate/catalog fixture and the same strict native inference/
  independent-policy/intent-validation path in memory only. It imports no DB/
  PayPal transport and selects only Gemini settings from the real environment.
  Modified agent/src/server.ts to export the existing parser for sanitized metadata.
- Modified web/src/server/paypal/agent-checkout-http.ts: owner/Host/Origin/CSRF/
  empty-body/rate-gated diagnose action before any checkout repository access,
  one process-local shared promise (including errors), new runtime header.
  Modified web/src/lib/agent-checkout.ts and
  web/src/components/agent-checkout.tsx: separate, explicitly live/synthetic
  validation result and honest old-failure guidance, no durable authority claim,
  persistent financial actions remain disabled.
- Added web/test/paypal-agent-recovery.test.ts: 5 mocked transport/security/query
  regressions prove synthetic payload isolation, strict native proposal schemas,
  credential failure, protected diagnosis without repository access, and failed/
  expired PostgreSQL preparation guards with no INSERT/UPDATE/DELETE or model call.
- Modified scripts/paypal-agent-serve.ts; added scripts/stop-owned-agent.ps1 and
  scripts/paypal-agent-stop.ts for owned graceful Windows handling, current build
  identity and runtime-verified readiness. Console helper pins saved epoch,
  node/listener PID and console membership. The actual process had no console;
  it refused with no signal. An initial PowerShell inspection missed the listener,
  and commentary incorrectly said it stopped; native netstat corrected that to
  PID 7072 still running. First restart safely refused AGENT_PORT_IN_USE.
  Initial fallback could not see stderr because it was discarded; capturing it
  privately corrected no-console classification.
- The console-less fallback verified the saved listener/epoch, required port 9229 unused,
  verified target 7072's exact web cwd and installed SIGTERM handler, then invoked
  only that existing Next cleanup through local inspector and disconnected.
  No environment/application/financial inspection was evaluated. It stopped 7072
  and started **5400** on 127.0.0.1:3032. No force-kill, global Node termination or
  unrelated-project process was used. Credential file is unchanged; agent epoch
  rotated normally, US profile/auth files preserved. Source sampling/parser and
  policy schemas were not weakened or changed by Task05B.
- Added scripts/paypal-agent-ui.mjs for explicit --live browser validation. Actual
  page 200, owner login, unauthorized 401, missing-CSRF 403, disabled legacy evaluate,
  new runtime/build match, one diagnostic and cached replay all passed. Actual
  Google flow at 03:05:31.092Z had 6 HTTP200 calls, one candidate/STOP, valid native
  arguments for readSpendingMandate/listApprovedMerchants/compareEligibleOffers/
  proposePurchase/readAuthorizedPaymentStatus, then VALID_FINISH. All 10 independent
  policy checks passed for synthetic 600 USD minor units; no real campaign, owner
  approval, saved intent, reservation, order or capture was created. API key/model
  values, prompts, tool payloads, signatures and auth headers were not printed.
- Actual desktop/mobile browser checks passed with zero page exceptions/overflow
  or unauthorized browser requests; screenshot visually inspected. Repeated
  diagnostic returned the identical cached promise result, not another API run.
  Final readonly DB comparison at 03:06:31.901Z matches every table row/hash and
  owner auth exactly. Original 600 reservation and US 600 consumption/zero
  reservation/400 available remain unchanged; no PayPal API call was made.
- Added docs/task-05b-agent-recovery-report.md; updated AGENTS.md and this handoff
  for accurate live-versus-synthetic-versus-durable state and explicit approval
  requirement. Recommended plan is new agent-05b-v1 namespace/owner-approved nonce,
  distinct mandate/purchase identities and agent05b:<terms-hash> key, with a new
  explicit expiry and optional append-only review link. This is a design only:
  no new versioned campaign support/record, audit event or financial authority was
  enabled. Existing agent-05a ids/configuration stay unchanged.
- Ignored evidence created/refreshed:
  .tools/task05b-database-baseline.json (hashes only),
  .tools/task05b-inspection.json, .tools/task05b-stop.json,
  .tools/task05b-application-live.json, .tools/task05b-live-desktop.png,
  .tools/task05b-live-mobile.png, .tools/paypal-agent-server.json and
  .tools/paypal-agent-server.log. Normal ignored build artifacts updated only in
  agent/dist/, web/.next/ and web/tsconfig.tsbuildinfo. No files deleted/moved.
- Fresh checks passed so far: Gemini 65; PayPal 264 with 20 optional DB/OAuth skipped
  (focused 21 included, not additive); root TypeScript, strict inspector/launcher/
  stop TypeScript; PowerShell parser; root contracts/agent/web production build;
  full lint and browser boundary 52 chunks; enforced read-only PostgreSQL structure/
  checksum/constraints/triggers/accounting verification and preservation hashes.
  Writable DB integration tests were not run under no-financial-mutation scope.
  Initial format checks flagged only helper/handoff formatting; final checks follow.
  A nested PowerShell here-string edit initially failed before writes and was
  reapplied safely; a duplicated route-read argument was corrected.
- No credential/dependency/lockfile/migration/original-source change, persistent
  campaign/financial/audit write, reservation, settlement, PayPal request,
  production deployment, commit or push occurred. New persistent recovery
  authority/audit links and every future payment action require separate approval.

### Final Task05B gates and operational handoff

- Full final npm run lint passed for 253 Biome files plus Foundry formatting.
  Full npm run format:check and git diff --check passed. Final PowerShell syntax
  parse passed. Root production build and root/script strict TypeScript passed.
- Actual-value secret scan passed: 339 tracked files, 369 candidates, 52 browser
  chunks; zero credential matches, environment ignored/untracked, no values
  printed. Browser-variable/private-key boundary passed for 52 chunks.
- Live application validation completed exactly one model run (six real Google
  POSTs); cached replay made no second inference. No live call failed. Five new
  mocked recovery cases are included in 264 PayPal cases; Gemini 65 passed
  separately. Twenty optional DB/OAuth integration cases stayed skipped; actual
  PostgreSQL validation used readonly transactions, never disposable-write suites.
- Final all-table data and owner-file fingerprints match baseline. Current
  listener is 5400, epoch/build/runtime identity verified; old 7072 is stopped and
  the temporary 9229 listener is absent. The browser panel open request was queued;
  the independently verified page is available directly at the recorded URL.
- All 14 source/test/script/instruction/document paths are identified in this
  entry/report; seven newly added candidate files account for 362 -> 369. No file
  was moved/deleted. Documentation spacing/edit command errors were corrected
  before the final formatter/whitespace checks and caused no application writes.
- Task05B's restoration/live verification and safe recovery plan are complete.
  No approval is pending for work already done. A future new persistent
  agent-05b-v1 campaign and optional append-only recovery link require explicit
  approval; old failure records/expiry and all financial history stay preserved.

## Outstanding work and recommended continuation

1. US order **72936380818559054** / capture **52C23729CU714125M** are COMPLETED;
   preserve the receipt and one-consumption accounting. No further payment is
   authorized. Resolve the original Nigerian
   obligation through matching credentials/PayPal support; retain its reservation
   until trusted disposition or a specifically approved risk decision.
2. Task05B restored actual owner-authenticated synthetic Gemini verification at
   http://127.0.0.1:3032/agent-checkout. The old campaign remains FAILED and must
   not be reset. Task05C's distinct authorized campaign and pending intent exist;
   its privacy incident and correction are recorded below. Do not rerun the
   old durable CLI, extend old authority or spend funds based on a diagnostic.
3. Broader production owner/agent authentication and consent remain future work;
   current test auth is local-only, not SSO. EIP-712 signatures are not PayPal approval.
4. Validate actual Sandbox account/single-seller routing, response shapes and real
   webhook delivery with approved credentials; no mocked test proves those work.
5. Add authenticated checkout UX and provider quote/delivery evidence integration
   while retaining original EVM regression coverage and explicit currency units.
6. Schedule/monitor read-only recovery in a later infrastructure task; define
   restricted runtime database roles, event retention and operator escalation.
7. Define refund/dispute/reversal behavior and selected PayPal product semantics
   before claiming TaskVault-like delivery escrow or unattended payments.
8. Review and publish Task 02 changes only when requested; no deployment is included.
9. Keep this handoff current for every change, including documentation updates.

### Supporting records

- [Migration implementation report](docs/migration/implementation-report.md)
- [Pre-change legacy dependency inventory](docs/migration/legacy-dependencies.md)
- [PayPal integration architecture](docs/paypal-integration.md)
- [Task 02 Sandbox backend guide](docs/paypal-backend.md)
- [Task 03A applied migration and real PostgreSQL report](docs/task-03a-database-report.md)
- [Task 03B real Sandbox OAuth report](docs/task-03b-oauth-report.md)
- [Task 03C controlled checkout and pending human action](docs/task-03c-checkout-report.md)
- [Task 03D US migration and preparation stop point](docs/task-03d-us-preparation-report.md)
- [Task 03E actual US order and human approval handoff](docs/task-03e-us-order-report.md)
- [Task03G completed US capture and verified accounting](docs/task-03g-capture-report.md)
- [Task 04 Gemini purchasing agent and PayPal policy integration](docs/task-04-gemini-integration-report.md)
- [Task05A agent checkout preparation and deferred live validation](docs/task-05a-agent-checkout-report.md)
- [Task05A live Gemini failure diagnosis and fix](docs/task-05a-gemini-diagnosis.md)
- [Task05B restored application and safe recovery plan](docs/task-05b-agent-recovery-report.md)
- [Preserved legacy architecture](docs/architecture.md)
- [Original README provenance](docs/migration/original-readme.md)
- [Current setup guide](README.md)

### Task 05C preflight — 2026-10-28 (incomplete)

The user authorized exactly one fresh persistent $10 / $6 USD Sandbox agent
preparation campaign, without orders, captures, reservations or other payment
mutations. **No new campaign was created.** `docs/task-05c-fresh-agent-campaign-report.md`
was added to record the read-only preflight and remaining implementation.
The existing campaign namespace, journal, identity and cookies are tied to
agent-05a, and the existing durable inference path requires a synthetic-only
privacy adaptation before it can satisfy the user's earlier data restriction.
Do not reuse or reset the failed campaign; implement and test a distinct,
atomic, retry-safe campaign before exercising the authorized persistent write.

Fresh read-only database checks verified TLS, database identity, Sandbox
binding, approved migration, owner/seller binding and all eight table
fingerprints against the Task 05B baseline. Three mandates, two attempts, four
financial idempotency rows and 18 audit entries remained; the original hold,
completed US accounting and old FAILED / INVALID_MODEL_RESPONSE journal were
intact. The existing agent profile was started on 127.0.0.1:3032 as PID 808;
its epoch matched, unauthenticated GET returned 401, owner login and protected
GET returned 200, and payment and reservation execution remained disabled.
This profile still shows the old campaign. Its ignored launcher/server logs and
inspection evidence were refreshed. No Google request, persistent database
write or PayPal payment request occurred in this session. The requested full
test/build/scanning suite was not run. `git diff --check` passed; a Markdown
formatting check was interrupted after producing no output, so formatting was
not verified. The first database inspector was interrupted after a long wait;
its retry passed. The earlier Task 05A/05B validation is
historical and does not verify the new campaign. Next: implement and validate
the versioned workflow and synthetic-only model boundary, then create exactly
one campaign and independently verify it and the preserved history.

### Task 05C continuation — 2026-10-28

At the start of this continuation no new campaign had been created. Modified
`web/src/server/paypal/test-auth.ts`, `agent-checkout-config.ts`,
`agent-checkout.ts`, `agent-checkout-postgres.ts`, `agent-diagnostic.ts`,
`web/src/lib/agent-checkout.ts`, `web/src/components/agent-checkout.tsx`,
`scripts/paypal-agent-serve.ts`, and `web/test/paypal-database.integration.test.ts`;
added `web/test/paypal-agent-campaign05c.test.ts` and
`scripts/paypal-agent-05c-verify.ts`. These changes add a separate campaign,
cookie, mandate, journal and idempotency namespace, transactional creation,
synthetic-only outbound model data with local policy validation, UI identity,
and tests/read-only verification. The old agent-05a namespace remains supported.
The initial privacy regression exposed a locally bound intent being rejected by
the outbound-data filter; the filters were separated and the new unit tests
passed 3/3. Earlier existing agent tests passed 21/21. Further database,
typecheck, build, security and application validation are in progress; no
result is implied until recorded below.

Also modified `scripts/paypal-db-test.ts` to allow focused disposable campaign
and invariant runs and `scripts/paypal-agent-prepare.ts` to report the campaign;
added `scripts/paypal-agent-05c-ui.mjs` for authenticated, payment-blocked browser
verification. The combined targeted agent suite passed 24/24. A real disposable
PostgreSQL run passed 19/20 including the new concurrency case; one pre-existing
financial trigger test received `POSTGRES_UNKNOWN` instead of its expected
immutable-terms error. A focused rerun is in progress. Do not treat the full run
as passed. The first standalone verifier typecheck used the wrong module setting;
the corrected ES-module/bundler typecheck passed. Root typecheck, lint and an
earlier format check passed; the secret scan found zero matches before the final
new scripts/build. Production build and focused database checks are in progress.

Fresh focused disposable PostgreSQL reruns passed the Task05C concurrency case
and the previously failing trigger-protection case (one pass / 19 skipped in
each focused run). The cause of the original `POSTGRES_UNKNOWN` remains
unconfirmed. A new pre-creation inspection at 2026-10-28T19:09:57.420Z matched
all historical fingerprints and the owner-auth hash, with three mandates and
two attempts. The complete PayPal/security suite passed 267 tests with 21 opt-in
cases skipped, and the Gemini adapter/parser suite passed 65. Final production
build passed. The owner-authenticated preparation operation then created one
Task05C campaign **556bce55-e74a-567f-8516-a80553b52c57**, mandate
**065af6d7-98d7-5262-a6a1-7fb33c2a1ddc**, created 2026-10-28T19:15:34.339Z
and expiring 2026-10-29T19:15:34.339Z (20:15:34.339 Lagos). Fresh read-only
PostgreSQL verification found cap1000, reserved0, consumed0, available1000,
one creation audit, zero new attempts and zero pending intents; all historical
rows and owner auth matched the baseline. The user-authorized campaign is
preparation-only; no PayPal request or reservation occurred. Replay, live
synthetic Gemini, browser and final checks remain in progress. An authenticated
creation retry returned the same IDs and expiry; later read-only verification
still showed one creation audit and no duplicate financial records.

The real Task05C evaluation returned a valid synthetic $6 proposal and persisted
one non-financial pending intent **570086fa-b2ae-5b50-85a2-107e2446ddc7**. It
made six HTTP200 calls and passed ten independent policy checks, with no funds
reserved or PayPal execution. **Privacy incident:** review immediately after the
run found the shared `readAuthorizedPaymentStatus` result contained historical
Sandbox order, capture and mandate identifiers and accounting. Its native tool
response was included in the subsequent Google request, contrary to the user's
synthetic-only instruction. The local owner/merchant/new-mandate identifiers and
credentials were excluded by the new outbound guard, but that guard did not yet
include the historical constants. The live server was gracefully stopped to
prevent further inference while this is fixed. The append-only pending intent
and historical records must not be erased or reset. The incident also means
earlier Task05B claims that no real historical observations were sent require
correction: the same shared tool output was in use, but exact prior request
bodies were not retained. The Task05C exposure is established from the tool
implementation, recorded native call sequence and model conversation code.
Changes in progress: synthetic-only tool responses omit historical anchors,
the outbound guard rejects all known historical IDs, and regression tests inspect
every model request. Do not run another live inference until the fix and checks
are complete.

The corrected synthetic-only response omits historical identifiers and balances;
outbound guards now include all known historical mandate, attempt, order and
capture IDs. `web/src/server/paypal/agent.ts` and
`web/test/paypal-agent-recovery.test.ts` were additionally modified, and
`scripts/paypal-agent-stop-direct.ts` added for the already guarded graceful
fallback. The console shutdown helper timed out before sending any signal; the
existing PID/epoch/listener/cwd-verified fallback stopped the old server, and
later stopped the affected Task05C server after the privacy discovery. The
synthetic-boundary/agent suite passed 38/38 after the fix. A fresh read-only
check found one creation event, one pending intent, zero attempts, zero reserved
and consumed, and all historical rows unchanged. An authenticated browser smoke
passed on the prior build before it was stopped; a corrected build, focused DB
test and final checks are in progress.

Final corrected web production build and authenticated browser smoke passed; the
server is running on port 3032 as PID 8564. The browser verified the saved live
proposal and policy decision with all payment mutations blocked. After restart,
an authenticated initialization retry returned the same saved campaign and
intent; a fresh PostgreSQL read again verified one creation, one pending intent,
zero attempts, cap1000/reserved0/consumed0/available1000 and unchanged historical
rows. The corrected PayPal/security suite passed 267 with 21 optional skips, and
the corrected focused real PostgreSQL campaign test passed. The full workspace
test command failed: Solidity 176 passed, agent 165 passed/8 skipped after its
legacy `security-demo.test.ts` setup returned `DEMO_ASSERTION_FAILED`, and web
440 passed/26 skipped. The failed legacy suite then passed all 8 cases in an
isolated rerun; the original failure's cause remains unknown. The earlier full
PostgreSQL test failure and its subsequent passing targeted retry remain
recorded above. Final lint passed; actual-value credential scan found zero matches
across 339 tracked, 374 candidate and 52 browser chunks; browser credential
boundary passed. No additional real Gemini inference was run after the privacy
fix, so that correction is supported by mocked transport checks only. Final root
typecheck, formatting and `git diff --check` passed. Read-only source-integrity
comparison passed for the original checkout's HEAD, refs, status, diff and 305
file hashes; Git emitted a CRLF normalization notice for its historical HANDOFF.

### Task05C-S — 2026-10-29 (hardening completed; live verification incomplete)

Requested complete outbound Gemini schema validation, a synthetic-only live
verification, investigation of both intermittent suites, and preservation of
all existing campaign/financial history. Added `scripts/paypal-security-inspect.ts`
for hash-only, read-only before/after inspection. Modified
`agent/src/local/security-demo.ts` to identify failed synthetic scenario/check
labels without suppressing assertions, and `web/test/fixtures/paypal-database.ts`
to distinguish sanitized transport/timeouts from PostgreSQL errors and report
only operation class and elapsed time. No test retry or timeout was relaxed.
Outbound-boundary implementation and validation are in progress; no new campaign,
intent or payment execution is authorized by this session.

Added the final strict transport policy in `web/src/server/paypal/gemini-boundary.ts`
and complete-envelope canary tests in `web/test/paypal-gemini-boundary.test.ts`.
Modified `agent/src/models.ts`, `web/src/server/paypal/agent.ts`,
`agent-checkout.ts`, `agent-diagnostic.ts`, `web/src/lib/agent-checkout.ts`,
`web/src/server/gemini-sessions.ts`, `agent/test/gemini.test.ts` and
`web/test/gemini-sessions.test.ts` to validate every HTTP attempt, require an
approved synthetic context, preserve authentic native call/signature history,
expose sanitized boundary counters and disable legacy model routes in this
profile. Updated `scripts/paypal-agent-diagnose.ts`, `gemini-model-probe.mjs`,
`gemini-phase-b.ps1` and `paypal-agent-05c-ui.mjs` for the enforced boundary and
new runtime marker. Added `scripts/paypal-security-live.ts` with a retained
exclusive one-run claim, memory-only inference and sanitized evidence, plus
`docs/task-05c-security-verification.md` for incident scope and actual results.
The live script has not yet been invoked. Restricted 15 existing local evidence/
auth items and the new `.tools/task05cs` directory to owner/SYSTEM; content hashes
were unchanged. Earlier evidence is preserved, never reset or deleted.

The complete disposable PostgreSQL suite passed 20/20 while the root suite ran;
two complete agent runs passed 173/173 each under contention. Neither prior
intermittent failure reproduced. The contention run instead hit a different
legacy web persistence-test five-second timeout (452 web passed/1 failed/26 skipped).
No retries, assertions or timeouts were relaxed; causes remain unconfirmed.
The final normal root run and remaining checks are in progress. The reported
PID8564 and port3032 listener are now absent on fresh OS inspection; a new owned
server will be started only after the corrected production build.

The one controlled synthetic live attempt completed with `MODEL_TIMEOUT` after
one actual Google network dispatch, no recorded HTTP response or model decision.
Authentication and live continuation remain unverified. No second inference was
run; the exclusive claim and original sanitized failure artifact are retained.
The initial harness discarded partial diagnostic counters on failure; added
typed progress retention in `agent-diagnostic.ts`/`paypal-security-live.ts` and a
failure regression in `paypal-gemini-boundary.test.ts` without rewriting failure
evidence. Root typecheck and lint passed at the prior checkpoint. One new broad
run passed contracts176/agent174 but failed web423/32 failures/26 skips: a newly
introduced text rule rejected the valid long policy code in 21 cases (fixed with
an exact code allowlist), alongside 11 timeout failures in legacy persistence/
RPC/handover suites. The six affected boundary/campaign/session/handover files
then passed 60/60 together. No timeout/assertion/retry was relaxed. Source
integrity verification passed for original HEAD, refs, status, diff and 305 file
hashes (existing historical HANDOFF CRLF notice only). Final complete tests and
production build are in progress.

Confirmed an additional shutdown defect after repeated worker-handover timeouts:
an active partial-body request received the correct 503 but retained keep-alive,
delaying close until the idle timer. Modified `api/src/server.ts` to mark replies
during shutdown `Connection: close`, and `web/test/worker-handover.test.ts` to
explicitly use keep-alive with a 60-second idle timer, assert closure within the
unchanged test deadline and clean up sockets on failure. Before the fix the new
assertion failed immediately (`keep-alive` instead of `close`); verification is
in progress. This is not established as the cause of the older PG/security-demo
failures. An initial test-name-filter invocation selected no cases due to command
quoting; the complete file was then run to reproduce the defect. No tests were
suppressed or timeouts relaxed. Root production build, formatting and credential/
browser-boundary scans passed; actual-value scan found zero matches across
339 tracked/379 candidate files and 52 chunks. Fresh read-only hashes matched all
persistent rows, and semantic verification confirmed exactly one Task05C creation,
one pending intent, zero attempts, ACTIVE/unexpired, cap1000/reserved0/consumed0/
available1000 and unchanged owner/agent/merchant/expiry/history.

The shutdown fix passed all five handover regressions. Started the corrected
owned server on free loopback3032, PID6668/runtime task05cs-synthetic-v1;
`.tools/paypal-agent-server.json` updated and the existing server log appended.
Read-only authenticated browser smoke passed with zero browser errors and all
payment mutations blocked. A first smoke attempt failed with raw output
suppressed; `paypal-agent-05c-ui.mjs` now catches failures using a fixed code,
because Playwright locator diagnostics can quote filled login values. No
credential was printed by the smoke report.

The database-enabled broad run finished unsuccessful: contracts176 passed,
agent145 passed/29 did not execute after a legacy Anvil 30-second setup timeout,
web474 passed/2 failed/6 skipped. Web failures were the already fixed handover
timeout (the running suite had loaded old code) and capture-once concurrency:
all four callers rejected after an observed 15,001ms client UPDATE read timeout.
Earlier standalone full DB20/20 passed; the old trigger failure did not recur.
Added sanitized all-rejected categories in
`web/test/paypal-database.integration.test.ts` and a `--capture` disposable selector
in `scripts/paypal-db-test.ts` to investigate without altering assertions or
production retry/claim behavior. Latest root typecheck and lint passed; final
normal suite runs without the competing build. Live continuation and transport
stability remain unresolved, not reported as successes.

The latest normal full root run passed: contracts176, agent174, web456 with
26 opt-in skips. Final audit tightened the generic adapter further: its outbound
policy is now mandatory in every profile, not only PayPal. Production legacy
Gemini sessions without a reviewed DTO policy are unavailable even with the
PayPal flag off; injected mocked session models remain supported for tests.
This intentionally disables legacy live EVM inference until it has its own
approved boundary, preventing a profile-off bypass. Added regression coverage
and explicit mocked-only policies in `agent/test/gemini-read-only.test.ts`,
`agent/test/gemini-response.test.ts`, `agent/test/gemini.test.ts` and
`web/test/gemini-sessions.test.ts`; new full verification is in progress. No new
live API invocation was authorized or attempted. ACL count clarification: the
earlier wording of 15 existing items was imprecise; final inspection checked
17 items including the directory and new evidence, all owner/SYSTEM only with
zero unexpected access rules.

Final unconditional-boundary root suite passed contracts176 +agent176 +web457 =
809 tests, with 26 opt-in skips. The isolated disposable capture selector passed
2/2, with 18 nonselected cases; its earlier timeout remains an unresolved
transport/timing issue, not erased by this pass. The old trigger case passed in
both full disposable runs. No automatic financial retry or policy relaxation
was added. Stopped only the owned PID6668/epoch/cwd/listener-verified profile
gracefully for final v2 build reload; current final marker is
`task05cs-synthetic-v2`. Final root types, formatting/build/runtime checks and
post-test fingerprint verification are being finished. No new Gemini API call
was made.

Final root typecheck passed after a test-only exactOptionalPropertyTypes fix:
the no-policy fixture now deletes the optional property instead of explicitly
assigning undefined; its 37 adapter tests passed. The earlier final typecheck
attempt failed on that fixture typing and is not counted as a pass. Fresh
post-test TLS/read-only fingerprints again matched all eight persistent tables
and owner authentication exactly: merchants4/attempts2/audit21/environment1/
idempotency4/mandates4/migrations1/webhooks0. No persistent campaign, mandate,
intent, reservation, accounting, financial idempotency or transaction changed.
The final v2 production build/reload is in progress; no new live inference is
being attempted.

Final v2 web production build passed. Restored the owned local profile on
loopback3032 as PID2360, runtime task05cs-synthetic-v2; owner/epoch/build gate
verified by the launcher. The final authenticated read-only browser smoke passed,
zero browser errors, saved campaign/proposal preserved, payment execution disabled,
reserved0/consumed0. Final actual-value secret scan again found zero matches over
339 tracked/379 candidate files and 52 chunks; browser secret-name/PEM boundary
passed. Final warning-free Biome check and root/API/agent/web TypeScript passed,
as did original Solidity formatting. Root build and final v2 web build passed.
After reload, fresh read-only TLS fingerprints again matched all persistent
tables and owner authentication. No actual PayPal requests or financial mutations,
new persistent campaign/mandate/intent, expiry changes, historical resets,
deployment, commit or push occurred. Ignored build/test artifacts were regenerated;
disposable PostgreSQL UUID namespaces were cleaned up with ownership/OID guards.

Known blockers remain explicit: the only controlled live Google attempt timed
out after one dispatch, so authentication/HTTP/model response/policy and live
tool continuation remain unverified. Its failure result and one-use claim remain
in `.tools/task05cs/`; no second call was attempted. The normal suite passed809,
but the separate broad DB run failed capture concurrency after a client timeout
and a legacy Anvil setup timed out; isolated DB20/20 and capture2/2 passes do not
establish stable combined execution or explain the original two flaky failures.
`docs/task-05c-security-verification.md` records all pass/fail/skip evidence and
the intentional legacy live-session compatibility change. Task05C-S is hardened,
but its full live success criterion is not claimed.

### Task05C-T — 2026-10-29

Requested precise timeout diagnosis, one newly authorized controlled live
evaluation after complete offline proof, concurrency reproduction and preservation
of all existing records. Fresh TLS/read-only fingerprints matched the Task05C-S
baseline before tests. Actual timeout is 15000ms; key/model presence confirmed
without values. Subsequent controlled live evidence is recorded below.

Added `agent/src/gemini-body.ts` and exported it from `agent/src/server.ts` for
one shared streamed response read capped at 1,000,000 bytes, with explicit abort
cancellation and sanitized stream-error categories. Modified `agent/src/models.ts`
to validate malformed outbound-policy/retry settings, support a bounded one-attempt
mode, cancel error bodies and classify HTTP status before body reads. Modified
`web/src/server/paypal/agent.ts`, `web/src/server/paypal/agent-checkout.ts` and
`web/src/server/paypal/agent-diagnostic.ts` to remove repeated response clones,
retain HTTP headers/body-timeout evidence, and forward bounded retry settings.
No timeout was increased and strict parsing/policy schemas remain intact.
Added `agent/test/gemini-body.test.ts`; extended
`web/test/paypal-gemini-boundary.test.ts` with hanging HTTP-error/success-body
regressions. Focused transport/parser83 and privacy/proposal39 passed at the
earlier checkpoints; current combined run passed contracts176/agent186 and web
is still running. Historical failure's exact phase remains unknown.

Added `scripts/paypal-timeout-stability.ts` with separate restricted
`.tools/task05ct` evidence, source/build-digest-bound offline proof and retained
one-use live claim. Reports contain only durations/sizes/status/categories,
allowlisted tool names, schema/boundary counters and policy result. Actual request
bodies, signatures, headers/credentials and historical records are not logged.
The live harness has zero HTTP retries and a maximum eight native turns.
Modified `web/test/fixtures/paypal-database.ts` for bounded read-only aggregate
pool/lock/blocker samples, unique application tags, server timeout settings,
event-loop delay and cleanup counters. Modified
`web/test/paypal-database.integration.test.ts` to enable those samples only during
capture-concurrency testing. Financial assertions/production retry logic are
unchanged. Updated `web/src/lib/agent-checkout.ts`,
`web/src/server/paypal/agent-diagnostic.ts` and `scripts/paypal-agent-05c-ui.mjs`
to final planned runtime marker `task05ct-transport-v1`; running server has not
yet been reloaded. Added `docs/task-05c-timeout-stability-report.md` to distinguish
confirmed code defects from unproven historical cause and pending results.

Complete offline interception passed six requests, all five native response turns,
15 cumulative response validations and33 rejected harmless local canary variants.
Ten independent checks passed for a mocked synthetic600 USD minor-unit ($6) proposal, not a real
model success. The matching source/build digest gated one newly authorized live
evaluation: one actual dispatch, first payload3866bytes, guard accepted1/rejected0/
canaryRejected3. Connection opened557ms and request headers sent574ms; no response
headers arrived before local abort15028ms, evaluation15245ms, max event-loop
delay137ms. Result MODEL_TIMEOUT at awaiting_headers; HTTP status/authentication/
quota/candidates/native calls/proposal/policy remain unverified. Stopped without
retry or a second live evaluation. The historical timeout phase remains unknown;
this new failure precedes body parsing, so the body-handling fixes do not explain
its external cause. Retained separate `.tools/task05ct/live-result.json` and claim.
Default-parallelism combined regression passed contracts176/agent186/web479 =841
tests, six skips, including all20 disposable PostgreSQL cases. Earlier intermittent
failures were not reproduced; their causes are not claimed fixed. Root lint and
formatting passed; compiled browser credential/PEM-name boundary passed52chunks.
Further comparisons, final accounting/build/reload/browser checks are pending.

Modified `scripts/paypal-db-test.ts` so its existing isolated `--capture` selector
explicitly displays sanitized test diagnostics; the installed agent reporter
otherwise hides logs from passing tests. No assertion, timeout, retry, database
target or parallelism changes. One npm invocation swallowed the `--capture`
argument and therefore ran the entire disposable suite; its actual full-suite
result will be recorded separately, not mislabeled an isolated capture run.
Fresh campaign-specific TLS/read-only inspection verified exactly one creation,
one pending intent, zero attempts, owner/agent/merchant bindings, immutable24h
expiry and1000/0/0/1000 accounting; all historical rows and owner auth matched.
Task05C-T evidence ACLs checked five items, zero unexpected access rules.

Additional fresh results: standalone full disposable suite20/20 passed407.01s;
direct isolated capture2/2 passed59.37s with18 nonselected cases. Sanitized samples
showed expected row-lock serialization (up to3 waiters), maxCheckedOut4,
maxAcquireMs1, maxWaiting3, checkedOutAtClose0 and schemaRemovedtrue. No pool
exhaustion or leaked transaction was demonstrated. Original source integrity
again matched HEAD/refs/status/diff and305 hashes. Root TypeScript passed.

The isolated summary revealed an actual configuration defect: main PostgreSQL
statement_timeout was0 despite configured10000ms. Added
`scripts/paypal-database-timeout-probe.ts`: approved-target/TLS read-only sessions
compare named startup GUC against PostgreSQL options; SET LOCAL10s is rolled back,
without table writes/sleeps/locks or persistent settings. Actual named startup
mode observed0/10000/0 before/in/after transaction; options mode observed
10000/10000/10000. Modified `agent/src/postgres.ts` to transmit the same intended
10000ms through startup options, retaining client15s/connection10s/pool4 limits.
Added a no-network configuration regression to `agent/test/testnet.test.ts` and
a real effective10000ms assertion in `web/test/fixtures/paypal-database.ts`;
observer options explicitly enforce its shorter2000ms bound. No deadline was
increased. This fixes a confirmed missing server limit, but does not prove the
historical intermittent capture failure's cause. A single-worker full regression
had already started before this discovery; final-source DB/build and focused
checks will be distinguished from earlier pre-fix outcomes.

Final-source isolated capture passed2/2 in49.11s,18 nonselected, with the new
real server assertion confirming10000ms. Cleanup checkedOut0/schemaRemovedtrue;
maxCheckedOut4/maxAcquire1ms/maxWaiting3, three bounded wait samples, server
lock_timeout0 unchanged. The sample's `statement_timeout` is the observer's2s,
not the main pool's10s; the summary reports the actual main value separately.
The intermediate single-worker run finished failed as expected from the build
mismatch: contracts176/agent186/web459 passed, one DB setup suite failed and26
web cases skipped (including20 DB cases never executed). It is not counted as a
full pass or unexplained flake. Recompiled final agent and focused15/15 tests
passed; standalone diagnostic-script TypeScript passed. A fresh final-source
single-worker full regression is now running with no further functional edits.

Final synchronized single-worker full regression passed contracts176/agent187/
web479 =842 tests, six opt-in skips; web502.70s. All20 disposable PostgreSQL cases
actually ran with the effective10000ms assertion. Historical capture/trigger/
security-demo failures did not recur. A final original-default-parallelism
comparison is running on the same frozen functional source. Updated the current
summary to remove stale PID/running/no-live claims and removed the interim
Architecture work note; prior chronological Task05C-S evidence remains intact.

Read-only ACL inspection checked ten Task05C-S/Task05C-T evidence/owner-auth items,
zero unexpected rules. Separately fingerprinted eight prior diagnostic/proposal/
auth/Task05C-S evidence files into restricted hash-only
`.tools/task05ct/incident-files-baseline.json` (create-new, never overwrite);
all eight plus the new baseline had owner/SYSTEM-only access. No raw evidence
content was printed or changed. The earlier incident evidence and one-use claims
remain available for audit.

Final default-parallelism full regression also passed contracts176/agent187/
web479 =842 tests, six opt-in skips, web387.06s. Together with the final single-worker
pass, both frozen-source runs exercised all20 real disposable PostgreSQL cases
under the effective10000ms assertion. Historical intermittent causes remain
unconfirmed, not declared universally stable or suppressed. Final production
build/reload/browser, refreshed type/lint/format and preservation scans follow.

Final root TypeScript (agent/web/API), root formatting, warning-free lint and
Solidity formatting passed. Biome retained informational style suggestions only;
no unrelated formatting/code fixes were applied. A fresh read-only TLS check after
all full test runs matched all eight persistent tables and owner-auth hash:
merchants4/attempts2/audit21/environment1/idempotency4/mandates4/migrations1/
webhooks0. Original-source HEAD/refs/status/diff and305 file hashes again matched.
The final root production build is running; no deployment or new live inference.

Root production build passed (contracts/agent/web, optimized Next build and
TypeScript/page generation). Existing unchanged Solidity advisory warnings about
timestamps/reverts remain; no new Solidity changes. Starting only the owned
loopback3032 preparation profile with `task05ct-transport-v1`, preserving owner
credentials and keeping payment/reservation execution false. No Gemini evaluation
or payment action is part of the reload/browser smoke.

Final owned server runs at127.0.0.1:3032 as actual PID17164, verified against
listener/process metadata and saved public runtime `task05ct-transport-v1`.
Launcher verified compiled owner gate/build/epoch, preserved owner credentials
and disabled payments/reservations. Epoch rotation requires re-login. The final
authenticated read-only browser smoke passed, zero browser errors, existing
agent-05c-v1 proposal/intent unchanged. Its interception allowed login/read-only
requests and blocked evaluate/diagnose/payment POSTs; it is not new live inference.
Final actual-value credential scan:339 tracked/384 candidate files/52 rebuilt
chunks, zero matches; environment ignored. Browser credential-name/PEM boundary
passed52chunks. Final transport digest matches the offline/live proof exactly;
read-only preflight made no new Google request and confirmed previous evidence.

Post-browser fresh TLS/read-only fingerprints again matched all eight persistent
tables and owner-auth hash, counts4/2/21/1/4/4/1/0 as listed above. Fresh semantic
read verified one campaign creation, one existing pending intent, zero attempts,
owner/agent/merchant binding, ACTIVE/unexpired, cap1000/reserved0/consumed0/
available1000 and exact immutable24h expiry2026-10-29T19:15:34.339Z
(20:15:34.339 Lagos). Final preservation check completed2026-10-29T16:54:11Z.
Eight earlier incident/proposal/auth/Task05C-S artifact hashes still matched.
One initial PowerShell verification used scalar string indexing instead of an
array, causing a diagnostic path/hash error; the corrected read-only comparison
passed all eight. This was not evidence modification. Owner/SYSTEM-only access
remains; raw evidence was never printed or changed.

`docs/task-05c-timeout-stability-report.md` now records final results, exact timeout
phase and remaining external uncertainty, privacy counters, all test passes/
intermediate failure/skips, actual server/browser state and Task05D gates.
Ignored `agent/dist/**`, `web/.next/**` and TypeScript build metadata were regenerated;
`.tools/paypal-agent-server.json`/`.log` were refreshed/appended for the owned
restart; restricted `.tools/task05ct/*` holds sanitized offline proofs, consumed
live claim/failure and hash-only preservation baseline. All disposable UUID test
schemas were cleaned with ownership/OID guards. No source/dependency/environment
change to project-flint, PayPal request, persistent reservation/accounting change,
new campaign/mandate/intent, history reset, expiry extension, deployment, commit
or push occurred. Live authentication/model response/tool continuation/policy
remain unverified because the one allowed evaluation timed out before HTTP
headers. Historical intermittent failure causes remain unresolved despite both
final full passes; no universal stability or Task05D financial permission is claimed.

### Task05C-T continuation — 2026-10-30

User requested continuation from the interrupted final documentation step.
The previous final formatter command was not executed because automatic approval
review could not complete after an account usage limit; this was not a safety
determination. The final report/handoff patches had already succeeded. The newly
requested retry formatted `docs/task-05c-timeout-stability-report.md` and
`HANDOFF-PAYPAL.md` successfully. Updated current status/date and documented that
the campaign's immutable expiry has passed. Previous October29 tests/build/live
failure remain historical results, not rerun claims. No new Gemini evaluation,
campaign, intent, financial record or expiry modification is authorized or run.
Fresh database preservation reads and local historical-view restoration are
being completed. The old PID17164 is not assumed current: no3032 listener was
found on resume. No unrelated process was stopped.

Fresh October30 TLS/read-only semantic verification returned unexpiredfalse with
unchanged stored ACTIVE status: expiry2026-10-29T19:15:34.339Z, one creation,
one pending intent, zero attempts, cap1000/reserved0/consumed0/available1000,
correct owner/agent/merchant bindings and historical-row/auth matches. Full
eight-table fingerprints again matched counts4/2/21/1/4/4/1/0. No status or expiry
was changed to reflect elapsed time. Initial sandboxed network inventory did not
reliably expose the listener; privileged OS verification confirms restored
PID6920 on127.0.0.1:3032, matching saved metadata/runtime, payments false.
The existing launcher refreshed `.tools/paypal-agent-server.json` and appended
`.tools/paypal-agent-server.log`; credentials and all campaign records remain
unchanged. No application code was changed in this continuation.

October30 final checks: authenticated read-only browser smoke passed with zero
browser errors, preserved historical intent and disabled payment execution.
Post-browser TLS/read-only hashes again matched all eight persistent tables and
owner auth. Fresh actual-value scan passed339 tracked/384 candidate files/52
compiled chunks with zero matches; browser credential-name/PEM boundary passed.
Verification completed2026-10-30T16:26:18Z (17:26:18 Lagos). Updated
`docs/task-05c-timeout-stability-report.md` with this dated continuation, explicit
expired authority, actual PID6920 and the distinction between historical full-suite
results and today's fresh checks. Full tests/build were not repeated because no
application source changed. Final documentation formatting and `git diff --check` passed.
No new Gemini evaluation, PayPal request, campaign/mandate/intent, financial
reservation/accounting change, expiry reset/extension, original-source change,
deployment, commit or push occurred. The single authorized live claim remains
consumed; authentication/live continuation and historical flake causality remain
unverified. Expired authority cannot be used for Task05D.

### Task05C-U — 2026-10-30

Requested a minimal bounded timeout correction, targeted mocked verification and
no real Gemini request. Read both AGENTS files, current handoff/report and the
installed Next data-security guide. Actual environment inspection via the existing
loader found configured model `gemini-3.5-flash-lite`, key present, official endpoint
and no explicit AI_TIMEOUT_MS override. No credentials were printed. An initial
ESM one-line inspection failed on the CommonJS export shape; the existing tsx
require path then succeeded without any network request.

The15s limit is per Gemini decide turn, including body reading and its bounded
HTTP retry; it refreshes across at most8 tool turns and is not a whole-workflow
deadline. Prior evidence establishes local abort before response headers, not
billing/quota/model rejection. Official model documentation lists the configured
model and required function-calling/structured-output support; account billing,
quota and key access cannot be inferred without a response/account evidence.

Changed only Gemini defaults from15000 to60000ms in `agent/src/models.ts` and
`web/src/server/paypal/agent.ts`, plus the reported default in the existing
`scripts/paypal-timeout-stability.ts`. Explicit overrides,10..60000ms validation,
Qwen's15s default, cancellation, HTTP classification, retries, schemas and final
privacy guard remain unchanged. This is a bounded latency accommodation, not
proof of the remote delay's cause or live remediation. Extended existing
`web/test/paypal-gemini-boundary.test.ts` with three fake-clock cases: slow20s
synthetic turns across a120s workflow, default60s cancellation, and explicit15s
override/cancellation. No framework, dependency, transport or service abstraction
was added. Results and checks are pending; no database or financial mutation.

First targeted run passed112 mocked tests across five existing Gemini/proposal/
privacy suites, including the three new clock cases. Agent typecheck and lint of
the four changed implementation/test files passed (two pre-existing informational
style suggestions only). Web typecheck caught a test-only mock forwarding call
without required fetch arguments; corrected to forward input/init, with the
affected boundary suite and web typecheck being rerun. This failure is not counted
as a typecheck pass. The owned loopback listener was independently verified as
PID6920 before build/reload. No real Gemini or PayPal request was made.

The corrected boundary file passed20/20 and web typecheck passed. Existing source
formatting passed. Stopped only owned PID6920 via its epoch/cwd/listener-verified
graceful helper; the one affected web production build (with agent prebuild) is
running. The future live entry point is the existing authenticated synthetic UI
diagnostic, not expired-campaign evaluation or the consumed Task05C-T CLI claim.
The older diagnosis CLI also has a separate60s whole-HTTP deadline; it is not the
source of the prior15s direct inference timeout and is not used for this task.

Correction to the immediately preceding CLI note: source inspection confirms
the old diagnosis CLI's60s AbortSignal is per native Google fetch, not an overall
workflow timeout. The prior15s abort came from the Gemini turn deadline. The
existing owner/CSRF-gated UI diagnostic is independent of persistent-campaign
checkout and can use its own in-memory fixture despite the real mandate's expiry.
The affected web production build passed; no live API call was made during build.
Read-only preflight reports effective60000ms, key/model present and old evidence
preserved. The consumed Task05C-T claim was not reset or replayed.

Final results: the corrected boundary suite passed20/20 and agent/web typechecks
passed; initial five-suite targeted run passed112 tests. Changed-source formatting,
lint and the one affected web production build passed. No full workspace or
PostgreSQL integration suite was rerun for this configuration-only change.
Reloaded only the owned profile as actual PID7404, loopback3032, runtime
`task05ct-transport-v1`; saved build ID matches the new build. Authenticated
read-only browser smoke passed with zero errors and blocked evaluation/diagnostic/
payment POSTs. Owner credentials remain unchanged; epoch rotated as usual.
Fresh credential scan found zero matches across339 tracked/384 candidate files/
52 rebuilt chunks; browser credential-name/PEM boundary passed. Final read-only
TLS database verification matched all eight table and owner-auth fingerprints,
counts4/2/21/1/4/4/1/0. Existing expired campaign/intent, completed US payment and
unresolved original reservation are unchanged; no campaign was created or extended.

Updated existing `docs/task-05c-timeout-stability-report.md` with the bounded
before/after configuration, current model, billing/quota uncertainty, three cases
and final evidence. The six Task05C-U source/documentation paths are
`agent/src/models.ts`, `web/src/server/paypal/agent.ts`,
`scripts/paypal-timeout-stability.ts`, `web/test/paypal-gemini-boundary.test.ts`,
`docs/task-05c-timeout-stability-report.md`, and this active handoff. Ignored
agent/web build outputs and TypeScript metadata were regenerated;
`.tools/paypal-agent-server.json`/`.log` were refreshed/appended for this owned
restart. No new framework, dependency, environment change or architectural layer.
Final changed-file formatting and `git diff --check` passed.
Ready for one separately authorized owner/CSRF-gated synthetic UI diagnostic;
not claimed solved until real inference succeeds. Old live claims/evidence remain
intact. No actual Gemini API request, PayPal mutation, financial reservation,
expired-record modification, original-repository change, deployment, commit or
push occurred. Account billing/quota/access and external latency remain unverified.

### Task05C-V — 2026-10-30 — stopped at user request

The user authorized one synthetic-only live diagnostic with the corrected60s
per-turn timeout, then requested a stop and fresh-session restart while local
preflight execution was stalled. Read AGENTS.md, web/AGENTS.md, this handoff and
the timeout/security reports. Inspected the final transport policy: it validates
the complete serialized request and rejects harmless canary mutations before
each network attempt; the existing evaluator is disposable and memory-only, with
an eight-model-turn limit. No application source or configuration was changed.

No Task05C-V live Gemini invocation was dispatched. Its one live authorization
remains unused. Offline and read-only database verification attempts did not
complete: restricted Node loading failed EPERM on a local filesystem ancestor;
other local command sessions stalled without a result, including a fresh shell.
The owned pending preflight sessions were cancelled before stopping. A simple
Node/TypeScript readiness check succeeded, but it did not verify the complete
evaluator. There is no fresh offline guard pass, PostgreSQL fingerprint result,
HTTP status, latency, tool turn, proposal or policy decision for Task05C-V.
Do not substitute the earlier Task05C-U mocked results or historical database
checks for these missing checks. Restricted incident evidence was not altered;
local access to its directory was denied during inspection.

Only HANDOFF-PAYPAL.md and docs/task-05c-timeout-stability-report.md were changed
to record this stop and restart position. No persistent campaign, intent,
reservation, financial/provider operation, expiry change, original-source edit,
deployment, commit or push was performed. Database preservation is supported by
the absence of mutation operations in this session, but fresh database equality
remains to be verified. No application process was restarted or stopped.

Resume with the existing offline full-envelope/canary verification and approved
read-only database fingerprint check. Once those pass, use the existing isolated
synthetic evaluator for exactly one live workflow, preferably one HTTP attempt
per turn. Preserve the consumed Task05C-T claim and earlier incident evidence.
Stop after any live failure; do not use the expired persistent mandate. Then
verify database fingerprints again and record sanitized actual evidence here
and in the existing timeout report. No tests, typecheck, lint or build were
rerun because there was no source change.

### Task05C-V — 2026-10-30 — resumed and completed

Resumed the unused one-diagnostic authorization. Reread required instructions,
handoff and timeout/security reports. Reused the existing synthetic fixture,
Gemini adapter, final envelope/canary guard and purchasing-agent policy engine.
No application source, dependency, environment or timeout setting changed.
Local restricted Node attempts still hit EPERM, and ESM-entry commands were
slow; those original preflights eventually returned successful results before
cancellation was attempted. The existing tsx/cjs entry returned promptly and
was used for the live invocation. This does not establish an ESM-loader defect.

Preflight confirmed key/model presence without displaying values and effective
60000ms per model turn. Existing abort handling, body-read deadline and eight-turn
limit remain; there is no separate whole-workflow timer. The theoretical model
waiting bound is480s plus tool/scheduling time. Used process-only HTTP maxAttempts1
so no retry could occur. Offline full-conversation verification passed:6 complete
requests,15 cumulative tool-response validations,33 rejected harmless canaries,
10 policy checks, zero real network requests. The existing harness created or
reused its sanitized mocked proof at .tools/task05ct/offline-
c5549b98e519b5e042bd3a77b7d4446cccfeb55947016f9027584b2e70e18533.json;
previous live claims and incident evidence were not reset or overwritten.
Before-live TLS/read-only verification matched all eight table and owner-auth
fingerprints. Only the unfinished checks were run; no full suite was repeated.

Exactly one actual live workflow ran2026-10-30T18:06:55.722Z through
18:07:02.460Z (19:06:55.722–19:07:02.460 Lagos),6738ms total. Six Google
responses returned HTTP200, one candidate each, finishReason STOP, no safety
block. Five native calls validated in order: readSpendingMandate,
listApprovedMerchants, compareEligibleOffers, proposePurchase,
readAuthorizedPaymentStatus; the sixth response was VALID_FINISH. Every native
argument schema passed. Per-turn headers/body-complete timings inms were
1595/1663,624/627,764/768,1442/1446,812/815,1082/1084. No abort, timeout,
HTTP retry, second independent workflow or API error occurred. Authentication
and the required function-calling/continuation features succeeded for this run.

The strict final proposal was synthetic-us-weather-600, amountMinor600 USD,
against a disposable1000-minor-unit test budget. All10 independent policy checks
passed. The actual pre-network final guard accepted6/rejected0 requests,
validated15 cumulative function responses and rejected33 mutated local canaries.
Only bounded synthetic authority/catalog and permitted authenticated native
history were sent; no historical payment data was used as model context. No raw
payload, secret, authentication header, signature or free-form model rationale
was logged. This is bounded allowlist/canary evidence, not a universal secrecy
claim or provider-side deletion of the earlier incident. The old15s timeout
remains a recorded local abort; this successful run does not explain its remote
latency or prove increasing the timeout alone caused the success.

After-live TLS/read-only fingerprints again matched all eight tables, counts
4/2/21/1/4/4/1/0, and owner auth. Fresh semantic verification confirmed one
Task05C creation and one unchanged pending intent, zero attempts, cap1000,
reserved0, consumed0, available1000. Expiry remains2026-10-29T19:15:34.339Z
(20:15:34.339 Lagos); stored ACTIVE does not bypass its derived expired state.
Historical failed campaign, completed US capture and unresolved original
reservation are unchanged. Zero persistent campaign/mandate/intent, financial
or PayPal mutations; the result existed only in disposable memory and sanitized
terminal/report evidence. No application restart, original-source change,
deployment, commit or push. This single live authorization is consumed.

Changed only HANDOFF-PAYPAL.md and docs/task-05c-timeout-stability-report.md
to record actual evidence and update current status. No new infrastructure or
source changes; no test-suite/typecheck/lint/build rerun was needed. Final
documentation checks are recorded below. Diagnostic success criteria are met;
the expired persistent mandate still cannot authorize future checkout.

Final documentation whitespace validation and `git diff --check` passed.

### Task05D — 2026-10-30 — offline checkout integration

Read both AGENTS files, active handoff and installed Next data-security guide.
Inspected proposal/policy, owner auth, durable journal, PayPal checkout/capture,
reconciliation, accounting and UI. No database mutation or live request is
authorized or performed. Implementation reuses the existing payment service,
PostgreSQL transaction locks/idempotency and canonical capture gateway.

Added web/src/server/paypal/agent-checkout-payment.ts as an owner-only adapter
for authorize-order, capture and read-only provider reconciliation. It requires
a separately enabled exact fresh-mandate scope, separate Sandbox buyer, stored
live proposal provenance, immutable bindings and independent initial policy.
Gemini tools remain proposal-only; no browser amount/identity/approval claim is
accepted. Execution is disabled by default and old campaign versions cannot opt in.
New web/test/paypal-agent-payment.test.ts covers the full mocked native-model to
checkout flow, owner security, schema/budget, expiry, concurrency/restart and
uncertain capture preservation. No new framework or dependency.

Modified web/src/server/paypal/agent-checkout-config.ts and test-auth.ts for
agent-05d-v1 with a separate owner session; agent-checkout.ts and
agent-checkout-postgres.ts for isolated identities/journal keys, immutable-intent
binding across changing financial accounting, and shared atomic creation.
The new durable campaign reuses an already-allowlisted fictional model fixture;
no privacy guard relaxation. Modified agent-checkout-http.ts to dispatch the
owner/Host/Origin/CSRF-gated actions through the adapter, web/src/lib/agent-checkout.ts
for payment view types, and web/src/components/agent-checkout.tsx for explicit
owner order, human buyer approval link, separate capture and reconciliation.
Existing historical profile views remain preparation-only. No campaign created,
old authority reset or model/payment request executed. The current local server
has not been rebuilt/restarted; testing is offline.

First targeted ten-suite run:189 passed/1 failed of190. The new policy-rejection
case detected gateway construction preceding final independent budget validation;
no network dispatch occurred. Moved policy/missing-attempt checks ahead of gateway
construction. Corrected seven-case integration suite, types and lint are pending.
Source formatting ran for the nine changed implementation/test paths above.

Final Task05D results: corrected integration suite passed7/7. A final combined
run passed211/211 across12 targeted suites, zero failures/skips: agent-payment,
agent-checkout, agent-campaign05c, gemini-boundary, gemini-agent, service, policy,
client, test-checkout, us-capture, test-auth and agent-recovery. All transports
were mocked; the new suite explicitly rejects any accidental global fetch.
It verifies six native model turns leave zero attempts, owner checkout produces
only one attempt/order, capture is blocked without fresh provider approval,
completed capture consumes600 once, concurrent/restarted calls cannot duplicate
execution, expired authority blocks financial actions, uncertain captures retain
600 reserved and reconciliation cannot create/capture. Simulated historical
mandate data and the original proposal remain unchanged.

Web TypeScript passed before and after the correction. Initial changed-file
lint reported seven warnings (one unused constructor field and six non-null test
assertions); removed the unused member and used explicit fixture guards without
suppression. Final lint and Prettier checks passed for all nine changed code/test
files. No full suite, persistent/disposable PostgreSQL test writes, production
build or browser smoke was run: the requested integration checks were offline,
and the running application remains on its prior build. No server restart or
credential/environment modification occurred. Web TypeScript incremental metadata
may have been refreshed by its existing check.

Fresh TLS/read-only verification compared all eight PayPal tables and owner-auth
fingerprints with the retained baseline: unchanged, counts4/2/21/1/4/4/1/0. Thus
the expired agent-05c-v1 campaign/intent, failed original agent campaign, completed
US capture and unresolved original reservation remain intact. Source/credential
scan passed339 tracked/386 candidates/52 existing browser chunks, zero actual
credential matches, environment ignored and values not printed. These52 chunks
are the earlier build, not a new Task05D build. No Gemini/PayPal network request,
new persistent campaign/mandate/intent/attempt, reservation, financial adjustment,
project-flint modification, deployment, commit or push occurred.

Complete Task05D file list (no additional report or framework):

- Added web/src/server/paypal/agent-checkout-payment.ts.
- Added web/test/paypal-agent-payment.test.ts.
- Modified web/src/server/paypal/agent-checkout-config.ts.
- Modified web/src/server/paypal/test-auth.ts.
- Modified web/src/server/paypal/agent-checkout.ts.
- Modified web/src/server/paypal/agent-checkout-postgres.ts.
- Modified web/src/server/paypal/agent-checkout-http.ts.
- Modified web/src/lib/agent-checkout.ts.
- Modified web/src/components/agent-checkout.tsx.
- Updated HANDOFF-PAYPAL.md for current status and this chronological record.

Next steps and separate authorizations for exactly one real Sandbox checkout:

1. Build and reload only the dedicated local agent profile before using the new
   UI; this is outstanding local verification, not a deployment. No new production
   build/browser success is claimed by this session.
2. Separately authorize creation of one fresh agent-05d-v1 campaign/mandate under
   the verified owner/agent and approved US Sandbox merchant, cap1000 USD minor,
   transaction limit600, immutable24h expiry. Select PAYPAL_AGENT_CAMPAIGN=agent-05d-v1
   and use the existing authenticated initialize operation. Never reset/reuse
   agent-05a or agent-05c-v1. Atomic creation and creation audit use the existing
   transaction/advisory lock with distinct namespace; no schema change is needed.
3. Separately authorize one synthetic-only real Gemini evaluation and persistence
   of its valid non-financial pending intent for that fresh mandate. Offline test
   provenance is simulated and grants no live authority. The new durable campaign
   maps to the existing fictional model fixture; no real payment records enter
   Gemini context. Revalidate current policy independently before checkout.
4. Separately authorize one600-minor-unit reservation plus one Sandbox order,
   and an eventual separate capture action for that order after human approval.
   Only after this authorization, configure PAYPAL_AGENT_CHECKOUT_EXECUTION to
   task05d-one-synthetic-checkout, PAYPAL_AGENT_CHECKOUT_MANDATE_ID to the exact
   fresh derived mandate ID, and PAYPAL_AGENT_BUYER_SEPARATE=true. These server-only
   opt-ins are scoped to the new campaign; ordinary global backend/payment flags
   stay disabled. No opt-in was configured during Task05D.
5. The authenticated owner clicks authorize-order with CSRF/Host/Origin checks.
   Canonical server terms and existing transactional policy authorize/reserve600,
   create exactly one idempotent order and return its validated Sandbox approval
   URL. A separate human Sandbox buyer must approve at PayPal. Callback/query/body
   approval claims grant no authority and never trigger capture.
6. The owner explicitly checks approval/reconciles, then requests capture only
   under the separately authorized permission. Existing capture performs fresh
   canonical approval/merchant/amount/currency checks, rechecks active/unexpired
   authority under lock and consumes the reservation only for a verified completed
   capture. Reconcile uncertain outcomes without resetting claims or releasing
   the historical unresolved reservation.

Implementation and offline checks are complete. Remaining gates are local
build/reload/browser validation, fresh separately authorized authority and stored
live proposal, human approval and separately authorized real financial execution.

The final handoff check initially reported Markdown formatting issues. Applied
Prettier to the handoff and reran its check plus git diff --check; historical
entries and their recorded outcomes are preserved.

### Task05D-S — 2026-10-30 — build/reload verification in progress

Read both AGENTS files, latest handoff and approved server/reload and browser
workflows. No Gemini or PayPal call, campaign/intent creation or database mutation
is authorized. Extended only scripts/paypal-agent-05c-ui.mjs to assert current
build metadata, the updated checkout explanation, an expired mandate, a disabled
owner payment control and absent buyer-approval/capture controls. Existing
browser interception permits only local GETs and owner login; all other browser
requests remain blocked. No application code change. Initial privileged listener
query found no3032 listener; verifying saved process identity and independent
netstat evidence before any stop/start. Build and preservation checks are pending.

Verified the saved PID7404 no longer exists and both privileged CIM/listener and
netstat checks find no3032 listener. No process was stopped. Before-build TLS
read-only fingerprints match all eight tables and owner auth. Existing seven
Task05D mocked safeguard tests passed7/7 with zero skips; modified smoke-script
lint and formatting passed. Production web build (including agent prebuild) is
running. No application source fix or live external request has been needed.

Final Task05D-S results: npm run build --workspace @flint/web passed, including
agent prebuild, optimized compilation, TypeScript, page generation and traces.
No application fix was needed. Initial launcher invocation using tsx/cjs returned
LOCAL_AGENT_SERVER_UNAVAILABLE before any child/listener or log write; the exact
cause was not captured. Owner/seller/configuration and fresh read-only database
preflights then passed. The standard approved command
`node --conditions=react-server --import tsx scripts/paypal-agent-serve.ts --detach`
succeeded. Do not infer a database or loader defect from the first generic error.
The prior PID7404 did not exist; no stop/kill was performed. Fresh OS verification
confirms Node PID9532, exactly one127.0.0.1:3032 listener, disabled execution and
a saved build ID matching web/.next/BUILD_ID. No unrelated process was changed.

Existing enhanced browser smoke passed: anonymous API401, owner login, current
build, new Task05D explanation, preserved agent-05c-v1 intent, derived expired
mandate, disabled owner order/reservation button and no buyer-approval/capture
controls. Zero page errors. Browser interception allowed only local GETs and
owner login; no initialize/evaluate/diagnose/order/capture/reconcile request was
sent. Seven existing mocked integration safeguards passed7/7, zero skips; the
full211-case Task05D run was not repeated. Script lint and formatting passed.
Rebuilt asset scans passed339 tracked/386 candidates/52 chunks, zero actual
credential matches, ignored environment and no credential names/PEM in browser
chunks. No secret values, session epoch or filled-input diagnostics were printed.

After-browser TLS/read-only fingerprints match all eight PayPal tables and owner
auth, counts4/2/21/1/4/4/1/0, identical to before build. Existing accounting remains
cap1000/reserved0/consumed0/available1000; immutable expiry remains
2026-10-29T19:15:34.339Z (20:15:34.339 Lagos), now expired. Campaign/intent,
historical failure, completed US capture and unresolved original reservation are
unchanged. Read-only Neon connectivity was used; no Gemini/PayPal API call or
database/financial mutation occurred. No deployment, commit, push or project-flint
change. Owner credential file is unchanged; approved launcher rotated session
epoch, so old browser sessions require re-login.

Changed only scripts/paypal-agent-05c-ui.mjs and HANDOFF-PAYPAL.md. Build-generated
agent/dist, web/.next and TypeScript metadata were refreshed; the approved launcher
refreshed .tools/paypal-agent-server.json and appended .tools/paypal-agent-server.log.
Earlier incident evidence/live claims were preserved. No new infrastructure,
dependency or application refactor. Final handoff/smoke-script Prettier checks
and git diff --check passed.

Verification has no remaining blocker. Next separate authorization must cover
one fresh agent-05d-v1 campaign/mandate, one synthetic-only real evaluation and
stored intent, then one600-minor-unit reservation/order and a separately approved
capture after human buyer approval. Clarification to Task05D's profile instructions:
the current approved launcher explicitly selects agent-05c-v1, so an environment
value alone cannot select agent-05d-v1. A controlled future profile-selection
change/configuration is needed when fresh-campaign work is authorized; it was
not needed or changed for this preserved-campaign verification. Never reset or
extend either expired campaign. No live checkout was started.

### Task05E — 2026-10-31 — one fresh Sandbox campaign

Read AGENTS.md, web/AGENTS.md and current handoff; inspected configuration, owner
authentication, creation transaction, database safety and verification workflows.
No application change is needed: PostgresAgentCheckoutRepository.initialize
already supports agent-05d-v1 with distinct IDs, advisory transaction lock,
mandate uniqueness, immutable 24-hour terms and one creation audit event.
The current launcher/UI remains on the preserved agent-05c-v1 profile; this task
creates the fresh campaign through the same existing authenticated repository
method without changing or restarting the application.

Read-only preflight passed: new campaign/mandate absent, existing owner login and
CSRF/session checks passed in an isolated CLI context, approved US seller binding
matched, direct dedicated Neon TLS/database and Sandbox environment validated.
All eight historical table fingerprints and owner auth match the retained
baseline, counts4/2/21/1/4/4/1/0. Four existing mandates were inspected, including
expired campaigns and preserved accounting. Local preflight loader attempts
stalled and were cancelled while still read-only; the standard TypeScript loader
completed the checks. No creation was attempted during those retries.

Authorized target campaign: 1bb93841-8f90-59a8-abd0-c24ffe4a4c16; mandate:
a355d338-3531-58e6-a57f-9b6b88219ca0; version agent-05d-v1. These are planned
identities until the commit is freshly verified below. Model/PayPal HTTP is
blocked in the operation context, payment opt-ins are cleared in memory and no
environment file or credential is changed. The retained historical baseline and
incident evidence will not be overwritten. Creation/verification results pending.

Creation completed once through the existing authenticated
PostgresAgentCheckoutRepository.initialize operation. Its transaction/advisory
lock, deterministic version-specific identifiers, mandate uniqueness and immutable
creation key were reused; no SQL insertion path or new infrastructure was added.
The creation call was not retried. Immediately afterward, a new read-only
transaction verified the persisted result; a separate Node process then repeated
the complete PostgreSQL verification using REPEATABLE READ READ ONLY and TLS.
Both checks passed, with exactly one matching version/campaign creation event.

Persisted campaign **1bb93841-8f90-59a8-abd0-c24ffe4a4c16**, version
**agent-05d-v1**, mandate **a355d338-3531-58e6-a57f-9b6b88219ca0**:

- Created UTC **2026-10-31T01:38:09.179Z**; Lagos
  **2026-10-31T02:38:09.179+01:00**.
- Expires UTC **2026-11-01T01:38:09.179Z**; Lagos
  **2026-11-01T02:38:09.179+01:00**. Persisted duration is exactly86400000ms.
- ACTIVE and unexpired at verification. CurrencyUSD, authorized1000,
  available1000, reserved0, consumed0, per-transaction ceiling600 minor units.
- Existing authorized owner and agent match; exactly one approved US Sandbox
  merchant matches the verified credential-to-merchant binding. Synthetic
  catalog reference retained; no actual model evaluation or proposal created.
- Exactly one MANDATE_CREATED audit event, zero pending intents, zero payment
  attempts; payment execution disabled in the creation configuration.

Before/after table counts in approved_merchants/attempts/audit/environment/
idempotency/mandates/schema_migrations/webhook_events order were
4/2/21/1/4/4/1/0 → **5/2/22/1/4/5/1/0**. Only the authorized mandate, merchant
restriction and creation audit record were added. All historical rows, excluding
only this new mandate's rows, match the retained baseline fingerprints in all
eight tables. This proves preservation of expired/failed campaigns and the old
intent, completed US capture/consumed600, original unresolved reserved600 and
other historical financial records. Existing owner credential file is unchanged.
The historical .tools/task05cs/database-baseline.json and incident evidence are
untouched; a whole-table comparison against that older four-mandate baseline
will now differ by these three authorized rows. Future checks must account for
the new campaign without replacing the historical evidence.

Both creation and independent verification installed an HTTP tripwire before
loading application modules and cleared execution/network opt-ins only in process
memory. Actual counters were HTTP attempts0, Gemini calls0 and PayPal operations0.
PostgreSQL accounting proves zero new reservation, order, capture or payment
attempt. No new intent, refund or payout. No persistent environment, credentials,
launcher, application source or test files changed. No server restart, deployment,
commit, push or project-flint modification. Only HANDOFF-PAYPAL.md changed in this
work session; authorized database additions are documented above.

No application code change required a repeated build or regression suite; fresh
database/authentication/binding/preservation checks are the Task05E validation.
Documentation Prettier write/check and git diff --check passed. The initial
formatter command hit sandbox EPERM during Node path resolution; the approved
escalated local formatter completed successfully. No remaining blocker to
campaign creation. The current application
still selects the old agent-05c-v1 campaign; selecting the new profile is future
controlled configuration work. Next separate authorization is needed for a
synthetic-only Gemini evaluation and any non-financial intent persistence.
Reservations/orders/captures remain separately unauthorized and require existing
owner policy checks and human buyer approval. Stopped after creation/verification.

### Task05F — 2026-10-31 — one live evaluation and non-financial intent

Read both AGENTS files and current handoff. Existing campaign configuration and
repository support agent-05d-v1, but scripts/paypal-agent-serve.ts hardcodes the
old profile. Minimal launcher correction will select PAYPAL_AGENT_CAMPAIGN through
the existing strict validator (old default preserved), explicitly clear financial
execution opt-ins and record the selected campaign in local server metadata.
No expired record or application policy is changed. Evaluation/persistence remain
behind existing owner authorization, durable evaluation lock, strict final
synthetic-only transport guard and transaction-time expiry/policy revalidation.
Preflight, offline guard checks, owned-server selection and one live evaluation
are pending. No model invocation has been made in this session.

Fresh OS checks found saved PID9532 no longer exists and no3032 listener, so no
process was stopped. Launcher formatting passed; Biome lint passed with zero
errors/warnings and one existing informational string-template suggestion.
Starting the approved launcher with agent-05d-v1, explicit60000ms per-turn timeout
and GEMINI_HTTP_MAX_ATTEMPTS=1; this does not itself evaluate or initialize any
campaign. Targeted mocked checks and read-only/offline preflight are running.

Read-only database preflight passed: exact campaign/mandate and immutable creation/
expiry, ACTIVE/unexpired, cap1000/per-transaction600/available1000/reserved0/
consumed0, no intent or previous evaluation claim; owner/agent/US merchant and
dedicated Sandbox TLS binding verified. Historical eight-table fingerprints and
owner credentials unchanged, counts5/2/22/1/4/5/1/0. Existing key/model match
web/.env.local without printing values. An offline call through the existing
inferPendingAgentIntent and final transport guard accepted the complete initial
serialized payload, rejected all3 harmless canaries and intercepted transport
before any Google request. The first preflight also required the old local server
and ended with a generic failure; the subsequent database/configuration/guard-only
preflight passed. No live model request occurred during either preflight.

Existing three mocked suites paypal-gemini-boundary, paypal-agent-checkout and
paypal-agent-payment passed43/43, zero failed/skipped; agent TypeScript prebuild
passed. Approved launcher succeeded with agent-05d-v1, live configuration present,
60000ms turn timeout, one HTTP attempt per turn and financial execution disabled.
No campaign initialization was invoked. Dispatching exactly one owner/CSRF-gated
application evaluate request; no workflow retry will occur. Actual outcome and
independent persistence/preservation verification are pending.

The single application evaluation succeeded: local API HTTP200, workflow latency
**12142ms** (includes application/database work, not a separately measured Google
per-request duration). Six actual Google HTTP200 responses; five native calls in
order: readSpendingMandate, listApprovedMerchants, compareEligibleOffers,
proposePurchase, readAuthorizedPaymentStatus, then strict structured finish.
Synthetic offer synthetic-us-weather-600, amount600USD, all10 independent policy
checks passed. No timeout or retry; no second live evaluation was started.

Application returned evaluationState PREPARED and intent
**4d59c38f-5632-54bd-98ee-d5b4d9d95eab**, HUMAN_AUTHORIZATION_REQUIRED,
ownerAuthorized=false, fundsReserved=false, null PayPal order/capture. Existing
repository rechecks owner, mandate, expiry using database clock under row lock,
immutable offer and policy before committing the pending intent audit record.
Each actual model dispatch used the existing mandatory serialized-request
allowlist/forbidden-value validator and synthetic canary probes. The response
could not reach transport unless those checks passed; no optional policy bypass
was enabled. Live runtime guard counters were not separately exported by this
endpoint; the offline intercepted initial request and43 mocked tests provide
additional evidence, without being presented as live inference.

Owned launcher selected agent-05d-v1 successfully. Fresh OS verification confirms
exactly one127.0.0.1:3032 listener, PID16860, matching the authenticated epoch-
verified application requests. No unrelated process stopped; previous PID9532
had exited. Owner credential file preserved; launch rotated the process session
epoch, so old browser sessions require login. .tools/paypal-agent-server.json was
refreshed and .tools/paypal-agent-server.log appended by the approved launcher.
Agent pretest build refreshed generated agent/dist. No environment file changed.
Fresh independent read-only PostgreSQL verification is in progress; no further
model or payment request will be made.

Final independent PostgreSQL verification passed through a separate process with
HTTP blocked, TLS identity checks and read-only transactions. Exactly one new
intent **4d59c38f-5632-54bd-98ee-d5b4d9d95eab** is durably PREPARED, created
**2026-10-31T01:57:16.316Z**; expiry remains **2026-11-01T01:38:09.179Z**
(02:38:09.179 Lagos), campaign ACTIVE/unexpired. Stored live evidence confirms
six HTTP200s and five native calls; independent policy validation reran locally
against the persisted mandate and offer, all10 checks passing. Intent remains
HUMAN_AUTHORIZATION_REQUIRED, ownerAuthorized=false/fundsReserved=false with null
PayPal order and capture. Available1000/reserved0/consumed0 USD minor units.

Only target audit additions occurred: one AGENT05D_EVALUATION_STARTED and one
AGENT05D_CHECKOUT_PENDING, alongside the unchanged MANDATE_CREATED event. No
failure marker, duplicate intent, campaign, mandate, merchant binding, idempotency
row or financial attempt was created. Counts are now5/2/24/1/4/5/1/0 versus
pre-evaluation5/2/22/1/4/5/1/0. All eight historical table fingerprints, excluding
only the authorized05d campaign rows, match the retained incident baseline;
owner credential hash unchanged. Expired/failed campaigns, old05c intent,
completed US capture and unresolved original reservation remain intact. No
historical baseline or incident evidence was overwritten. Zero PayPal operations,
reservations, refunds or payouts; one live evaluation only. No expiry extension,
deployment, commit, push or project-flint modification.

Changed source only scripts/paypal-agent-serve.ts (validated environment profile
selection, preserved05c default, explicit disabled financial opt-ins, selected
campaign in local metadata/output) plus HANDOFF-PAYPAL.md. No application build was
needed because compiled application modules were unchanged;43 targeted mocked
tests and the agent TypeScript prebuild passed, launcher lint passed with one
pre-existing info, formatting and diff checks passed before final log edits.
Final formatting and git diff --check also passed. No blocker remains for this evaluation/intent
stage. The next separate authorization must explicitly cover reservation/order
creation; capture additionally requires normal human buyer approval and separate
authority. The preparation launcher deliberately clears financial execution
opt-ins; any future enablement must be a controlled, separately authorized
configuration change. Stopped without starting checkout or payment execution.

### Task05G — 2026-10-31 — owner approval and reservation review

Read AGENTS.md, web/AGENTS.md and current handoff; reviewed agent payment adapter,
HTTP owner/Origin/CSRF protection, TestOwnerAuth, payment policy, reserve/createOrder
split, PostgreSQL row locks/idempotency and existing preparation workflows.
The user's explicit approval is limited to existing intent
4d59c38f-5632-54bd-98ee-d5b4d9d95eab, campaign agent-05d-v1 and600USD minor units.
No Gemini, new authority/intent or PayPal provider operation is authorized.

AgentCheckoutPaymentService.action exposes authorize-order, capture and reconcile;
authorize-order calls createOrder and therefore cannot be invoked under this
authorization. Existing PayPalPaymentService.reserve separately performs a
transactional policy check, new RESERVED attempt and budget hold with no gateway
call. It is already used by preparation-only workflows while payment execution
is disabled. Plan: authenticate the real local owner through the application,
verify signed session/Origin/CSRF through existing TestOwnerAuth, independently
validate saved intent and immutable merchant terms, and call only the existing
reserve method with that principal and unchanged intent idempotency key. No
fabricated owner principal, approval, provider response, new endpoint or disabled
gate override. Stop on any auth/policy/expiry mismatch. Read-only preflight and
actual reservation are pending; no financial mutation has been attempted.

Fresh preflight passed: ACTIVE/unexpired exact campaign/mandate, existing sole
HUMAN_AUTHORIZATION_REQUIRED intent, approved US merchant binding and all10
independent policy checks, available1000/reserved0/consumed0 USD minor units.
All historical fingerprints and owner credential hash match; table counts remain
5/2/24/1/4/5/1/0. Actual local application login succeeded against PID16860 and
epoch-verified profile. Its returned signed session, exact Host/Origin and CSRF
were validated by existing TestOwnerAuth; owner principal was derived through its
principal method, not supplied manually. User's Task05G instruction is the
explicit approval for this exact intent/amount/reservation-only operation; no
additional interactive approval factor is required by the existing local auth.

Preparing exactly one call to PayPalPaymentService.reserve with the saved intent's
unchanged idempotency key. It rechecks identity/merchant/status/expiry/budget under
the existing PostgreSQL mandate row lock and post-lock database clock. No
authorize-order route, financial execution flag change or PayPal client is used;
all gateway methods and non-local HTTP are blocked in the operation process.
The three existing target audit rows were fingerprinted for post-operation
immutability checks. Reservation outcome and independent verification pending.

Single standalone reserve call completed successfully after fresh actual owner
login/session verification and all10 independent checks. Created reservation/
attempt **b7914b21-a74f-4b68-b531-06b5cd4fcdc0**, state/budgetState RESERVED,
at **2026-10-31T02:13:50.996Z** (03:13:50.996 Lagos), bound to the existing
intent idempotency key and approved merchant. Fresh immediate accounting read:
authorized1000/reserved600/consumed0/available400 USD minor units. Mandate expiry
unchanged at2026-11-01T01:38:09.179Z. No retry was needed or submitted. Gateway
calls0, non-local HTTP attempts0, Gemini calls0, PayPal orders/captures0. Financial
execution flags remain disabled; the combined authorize-order action was never
called. Independent fresh-process PostgreSQL/preservation verification pending.

Independent verification passed its actual database assertions: one RESERVED
attempt600USD, cap1000/reserved600/consumed0, existing intent/purchase key, null
order/capture, one BUDGET_RESERVED event and two undispatched RESERVED request
identities. All historical fingerprints and the three pre-existing target audit
rows match. Counts5/3/25/1/6/5/1/0. The ad hoc verifier's summary accidentally
retained reservedMinor="0" from the earlier non-financial verifier despite its
database assertions requiring600 and the immediate accounting read showing600.
Corrected this diagnostic-only projection to use actual database values and
repeating read-only verification; no application/accounting code or record was
changed to correct the output. No reservation retry or further mutation.

Corrected independent read-only verification passed, displaying actual
reserved600/consumed0/available400. Exactly one600USD reservation and two unique
RESERVED request-identity placeholders exist; neither identity represents a sent
PayPal request. Only one BUDGET_RESERVED audit event was added. The original
intent remains immutable HUMAN_AUTHORIZATION_REQUIRED with its original
ownerAuthorized=false/fundsReserved=false proposal fields; actual owner approval
and the hold are represented by the authenticated reservation invocation and
RESERVED financial attempt, not by rewriting model-proposal history. Owner
credentials, original intent/audit fingerprint, all historical records and
mandate creation/expiry are unchanged. No campaign/intent, order/capture, refund,
payout, deployment, commit, push or project-flint change.

Only HANDOFF-PAYPAL.md changed; no application/configuration/dependency/test or
credential file was modified and no server restart occurred. Existing accounting,
auth and transactional policy code was reused without a new endpoint or refactor.
No source change required another build or regression suite; actual owner auth,
independent policy checks, fresh PostgreSQL preservation/accounting reads and
documentation checks are this session's verification. No remaining blocker for
the reservation stage. Stop here; creating one Sandbox order requires separate
authorization, and capture still requires human buyer approval and later explicit
authority. No financial execution opt-in was enabled.

Final handoff Prettier check and git diff --check passed.

### Task05H — 2026-10-31 — one existing-reservation Sandbox order

Read both AGENTS files, current handoff and installed Next server/client guidance;
reused existing owner login/signed session, Origin/Host/CSRF verification, policy,
Postgres journal and PayPalClient. Fresh preflight verified exact campaign/intent/
reservation/approved US merchant, ACTIVE/unexpired authority, held600USD and
existing-reservation policy using database time. No order ID or creation claim;
both request identities RESERVED/unsent. No PayPal lookup by request ID exists;
with no known reference, unused durable identities/claims establish first dispatch.

Minimal confirmed-blocker fix: existing createPreparedOrderOnce hardcoded the old
US purchase key. It is preferable here to generic createOrder because it never
reserves again, commits a non-retryable claim and preserves held budget on errors.
Changed web/src/server/paypal/config.ts (optional server-owned purchaseKey),
web/src/server/paypal/us-order.ts (exact key binding, old default preserved),
web/src/server/paypal/service.ts (PREPARED_ORDER_AUTHORIZED label for explicit
scopes; old Task03E label unchanged), and web/test/paypal-us-order.test.ts (two
regressions: key substitution/legacy isolation, concurrency/restart, no duplicate
reservation and capture-disabled client). No new dependency, endpoint or refactor.

Targeted order/client/agent-payment mocked suites passed55/55, zero failed/skipped.
Agent TypeScript prebuild, web typecheck and changed-file lint passed. Initial
format check flagged the added test layout; formatted it and final source-format
check passed. Checks refreshed generated agent/dist and web incremental metadata.
No full suite or production rebuild was needed for this scoped TypeScript
operator path; no server/environment/credential configuration changed or restarted.

Exactly one existing createPreparedOrderOnce invocation used the original
reservation/request identity and authenticated owner. Its private client was
order-only, maxRetries0, with a final transport allowlist permitting OAuth, at
most one exact600USD Orders POST and canonical GETs only for its returned ID.
Capture/other financial methods were blocked at permission/gateway/transport.
Actual responses: OAuth200 (1271ms), order POST200 (1213ms), canonical GET200
(759ms); one financial POST, no retry, zero capture requests and zero Gemini calls.

Order **6U113515L79775315**, canonical **PAYER_ACTION_REQUIRED**, local
**AWAITING_APPROVAL**. Actual canonical amount600USD, seller, reservation
reference/custom IDs and absence of captures validated. Exact official Sandbox
buyer URL was persisted by the existing journal and returned to the owner; it
was not opened or approved. Fresh independent read-only PostgreSQL verification
passed: same reservation **b7914b21-a74f-4b68-b531-06b5cd4fcdc0**, original
intent **4d59c38f-5632-54bd-98ee-d5b4d9d95eab** and keys, one creation claim,
one budget reservation event, null capture and unchanged authorized1000/reserved600/
consumed0/available400. Immutable expiry2026-11-01T01:38:09.179Z (02:38:09.179
Lagos), still ACTIVE/unexpired at creation and verification.

Counts5/3/29/1/6/5/1/0 versus5/3/25/1/6/5/1/0: only four new target audit events
(authorization, CREATE_PREPARED, ORDER_REFERENCE_OBSERVED, PAYPAL_STATE_RECONCILED)
and updates to the existing attempt/request state; no extra financial attempt,
campaign, intent, reservation or request identity. Historical eight-table
fingerprints, original intent audit and owner credential hash match. Completed
US capture and unresolved original hold remain intact. Updated this handoff with
actual results and spent authority. No deployment/commit/push/project-flint change.
No blocker remains for order creation. Stop: manual buyer approval is next;
capture requires separate explicit authorization, never another order POST.

Final handoff formatting and git diff --check passed.

### Task05I — 2026-10-31 — read-only buyer approval verification

Read both AGENTS files and current handoff. Reused PayPalClient.getOrder and
existing Sandbox/environment/database/binding validation; no application change.
One OAuth authentication POST200 (1498ms) and one exact-order GET200 (440ms),
maxRetries0 and transport restricted to those paths. At2026-10-31T03:13:22.857Z,
order **6U113515L79775315** is **APPROVED**. Actual amount600USD, approved US
merchant, reference/custom IDs and existing reservation
**b7914b21-a74f-4b68-b531-06b5cd4fcdc0** match. Buyer approval verified; no
captures in PayPal, null local capture reference, consumed0.

Read-only PostgreSQL snapshots before/after match all eight full-table hashes
and owner credential hash; counts5/3/29/1/6/5/1/0. Campaign ACTIVE/unexpired,
expiry unchanged2026-11-01T01:38:09.179Z (02:38:09.179 Lagos), authorized1000/
reserved600/consumed0/available400 USD minor units. No reservation, intent,
campaign or historical record changed. No financial POST, capture, Gemini request
or database write. No reconcile method was called: local AWAITING_APPROVAL and
last observed PAYER_ACTION_REQUIRED intentionally remain unchanged despite fresh
remote APPROVED evidence. Eligible for the next separately authorized capture,
which must perform fresh authorization/expiry/approval checks; no capture now.

Only this handoff changed. No refactor, dependency, test/build rerun, environment
change, deployment, commit, push or project-flint modification. Stopped after
verification; separate capture authorization remains required.

Handoff formatting and git diff --check passed.

### Task05J — 2026-10-31 — final scoped Sandbox capture

Read AGENTS.md, web/AGENTS.md and current handoff; reviewed existing agent payment
guard/adapter, signed owner authentication and idempotent capture service. Reused
AgentCheckoutPaymentService.action with the real owner principal, signed session,
Origin/Host/CSRF, exact existing campaign/intent/reservation/order and approved
merchant. Fresh PayPal APPROVED/no-capture GET and buyer/merchant separation were
verified without logging buyer data. The existing agentPaymentEnabled guard was
enabled only in this temporary operator context, scoped to the mandate and the
explicit Task05J authorization; running server/environment flags stayed disabled.

Ad hoc preflight initially failed on duplicate/import ordering before provider/
database access, then correctly rejected capture authorization while the journal
still said AWAITING_APPROVAL. Corrected diagnostic sequencing; no policy override
or manual approval field change. Successful read-only preflight left all eight
table hashes unchanged. Existing guarded reconcile action fetched real APPROVED
and persisted it; fresh database-clock policy authorization then passed against
actual APPROVED, ACTIVE/unexpired authority, reserved600/consumed0/available400.
Expiry stayed2026-11-01T01:38:09.179Z (02:38:09.179 Lagos).

Exactly one capture action used the original capture request ID, durable
CAPTURE_PREPARED claim and maxRetries0. Gateway/final transport allowed only this
capture and its canonical reads; new orders, reservations and other payments were
blocked. Capture POST returned **HTTP201** (2173ms). Canonical capture GET200 and
additional independent order GET200/capture GET200 verified order
**6U113515L79775315 COMPLETED**, capture **0V581522H50035631 COMPLETED**,
amount600USD, final capture, approved merchant and matching order membership/
reference binding. Verification completed **2026-10-31T03:33:20.229Z**.

Fresh PostgreSQL reads confirm the same attempt/reservation
**b7914b21-a74f-4b68-b531-06b5cd4fcdc0**, SUCCEEDED/CONSUMED, authorized1000/
reserved0/consumed600/available400. Original intent
**4d59c38f-5632-54bd-98ee-d5b4d9d95eab**, campaign/mandate IDs and request keys
preserved. Exactly one capture claim and one COMPLETED consumption observation;
no retry or additional financial operation. Counts5/3/32/1/6/5/1/0 versus prior
5/3/29/1/6/5/1/0: only APPROVED reconciliation, CAPTURE_PREPARED and COMPLETED
reconciliation audit entries added, with existing attempt/accounting/key-state
updates. No new authority, intent, reservation or order. All historical eight-table
fingerprints, every prior target audit row and owner credential hash match;
earlier completed US capture and unresolved original reservation are unchanged.

Existing agent-payment/payment-service mocked suites passed33/33, zero failed/
skipped; agent pretest TypeScript build and operator syntax check passed. No
application source/configuration/dependency/test change or full rebuild was
needed. Only HANDOFF-PAYPAL.md changed; pretest refreshed generated agent/dist.
No Gemini request, refund, payout, deployment, commit, push or project-flint change.
No remaining failure/blocker. This capture authority is consumed; stop here and
never repeat it or spend the remaining400 without separate explicit authority.

Final handoff formatting and git diff --check passed.

### Task06 — 2026-10-31 — security scenario and demo readiness

Read AGENTS.md, web/AGENTS.md and HANDOFF-PAYPAL.md; inspected the existing
security scenario runners, UI consoles (`RecordedDemo`, `PayPalAgentConsole`,
`SecurityDemos`) and server-side policy implementation (`web/src/server/paypal/agent.ts`).

Modified seven repository files (`web/src/lib/paypal-agent.ts`,
`web/src/server/paypal/agent.ts`, `web/src/components/gemini-console.tsx`,
`web/src/components/recorded-demo.tsx`, `web/src/components/security-demos.tsx`,
`web/test/paypal-gemini-agent.test.ts` and `scripts/preview-smoke.mjs`) plus this
handoff:

- **Normal purchase (`A — Normal Purchase`):** added read-only Task05J receipt
  metadata (`Order 6U113515L79775315`, `Capture 0V581522H50035631`, `COMPLETED`
  at `2026-10-31T03:33:20.229Z`, `$10.00` authorized / `$6.00` consumed / `$0.00`
  reserved / `$4.00` available, campaign `1bb93841-8f90-59a8-abd0-c24ffe4a4c16`,
  mandate `a355d338-3531-58e6-a57f-9b6b88219ca0`, intent
  `4d59c38f-5632-54bd-98ee-d5b4d9d95eab`, attempt
  `b7914b21-a74f-4b68-b531-06b5cd4fcdc0`) to `VERIFIED_PAYPAL_AGENT_RECEIPT`,
  `historicalImmutableRecords`, `PayPalAgentConsole` (`data-testid="paypal-completed-receipt"`)
  and `RecordedHistory` without replaying any payment or model call. Added
  `TASK_05J_AGENT_MANDATE_ID` and `TASK_05C_MANDATE_ID` to
  `LOCKED_HISTORICAL_MANDATE_IDS` (`COMPLETED_MANDATE_REUSE_FORBIDDEN`) and the
  outbound synthetic Gemini canary list.
- **Prompt injection (`B — Prompt Injection`):** set
  `forcedOfferId: "offer-unapproved-merchant-300"` on the `prompt-injection`
  fixture so `DeterministicPayPalPolicyModel` submits the adversarial `$3.00`
  unapproved-merchant offer to `proposePurchase`, returning an explicit
  `PROPOSAL_REJECTED` (`UNAPPROVED_MERCHANT`) verdict with `0` reserved funds
  while keeping scripted `GeminiModel` tests unchanged (where Gemini ignores the
  injection and selects the `$4.00` approved offer). Added an explicit judge
  callout and fixed failed policy-check badge styling (`passed`/`failed` classes).
- **Invalid delivery (`C — Invalid Delivery`):** verified `fabricated-delivery`
  rejects tampered offer commitment digests (`0xdeadbeef…` vs expected
  `keccak256` digest) pre-proposal with `INVALID_DELIVERY_COMMITMENT` and `0`
  reserved funds. Added an explicit safeguard boundary callout stating what is
  implemented in the PayPal rail (pre-proposal `keccak256` commitment digest check,
  SLA check, SHA-256 immutable intent-to-checkout term binding, mandatory human
  approval gate, canonical post-capture binding) versus what is not implemented
  in PayPal immediate `CAPTURE` (no post-capture merchant payload byte inspection,
  no delivery-conditional PayPal escrow hold and no automated post-capture refund/
  dispute reversal, unlike the legacy EVM `TaskVault` escrow demo).
- **Budget exhaustion (`D — Budget Exhaustion`):** set
  `forcedOfferId: "offer-us-weather-fast-400"` on the `budget-exhausted` fixture
  (`$2.00` available vs `$4.00` offer) so `DeterministicPayPalPolicyModel`
  submits the over-remaining-budget proposal to `proposePurchase` and returns
  `PROPOSAL_REJECTED` (`BUDGET_EXHAUSTED`) with `0` reserved funds; also added
  unit verification that a `$6.00` proposal against a `$4.00` remaining
  Task05J-equivalent budget is rejected with `BUDGET_EXHAUSTED`.
- **UI & `/security` alignment:** spotlighted `A — Normal Purchase`,
  `B — Prompt Injection`, `C — Invalid Delivery` and `D — Budget Exhaustion` as
  the primary scenario buttons in `PayPalAgentConsole` (with `P3`, `P5`, `P6` in
  `<details>`) and added a mode switch (`Demo Mode` / `PayPal Agent · Policy`) on
  `/security`.

Verification run and results:

- `npx --workspace @flint/web vitest run paypal-gemini-agent recorded-demo security-recordings security-demos theme-console`:
  passed 5/5 files, 62/62 tests.
- `npm run typecheck`: passed across `@flint/agent`, `@flint/web` and `api`.
- `npm run lint`: passed (`biome lint . --error-on-warnings` and Forge fmt check).
- `npm run build --workspace @flint/web`: production Next.js webpack build passed.
- `node scripts/check-web-boundary.mjs` and `npm run paypal:secrets:check`: passed
  (52 browser chunks scanned, 0 credential matches across 339 tracked / 386
  candidate files).
- `node scripts/preview-smoke.mjs`: passed across all 8 production routes, all 4
  `Demo Mode` scenario controls, `PayPal Agent · Policy` mode switch, read-only
  Task05J receipt (`6U113515L79775315` / `0V581522H50035631`), all 4 PayPal
  verdict assertions, mobile layout and 0 browser exceptions with external
  requests/mutations blocked.
- `npm run paypal:db:verify`: passed read-only (`checksum: eaa2680ae6a842456989b3895b944b73d4e1fd551a5ee66161ed836c42ba21ad`,
  unchanged row counts `5/3/32/1/6/5/1/0`).
- `node scripts/source-integrity.mjs verify ..\project-flint .tools\source-integrity.json`:
  passed (`305` file hashes unchanged).
- Zero live Gemini calls, zero PayPal API operations, zero database writes, no
  deployment, commit or push.

### Task07 — 2026-11-01 — public demo-only lockdown and deployment handoff

Prepared a public **DEMO-ONLY** configuration for Earmark PayPal on Vercel Hobby
without AWS services, separate backends, paid services, live Gemini calls,
PayPal API operations or database mutations.

Added one file (`.vercelignore`) and modified 17 repository files (`.gitignore`,
`web/src/lib/paypal-agent.ts`, `web/src/app/api/workspace/route.ts`,
`web/src/app/api/workspace/[action]/route.ts`,
`web/src/app/api/paypal/test/route.ts`,
`web/src/app/api/paypal/test/[action]/route.ts`,
`web/src/app/api/paypal/agent-checkout/route.ts`,
`web/src/app/api/paypal/agent-checkout/[action]/route.ts`,
`web/src/app/api/paypal/webhooks/route.ts`, `web/src/app/layout.tsx`,
`web/src/components/navigation.tsx`, `web/src/components/gemini-console.tsx`,
`web/src/components/paypal-test.tsx`, `web/src/components/agent-checkout.tsx`,
`web/src/components/security-demos.tsx`,
`web/src/components/workspace-provider.tsx`,
`web/test/paypal-gemini-agent.test.ts`) plus this handoff:

- **Server-side public demo lockdown (`isPublicDemoOnly`):** when
  `EARMARK_PUBLIC_DEMO_ONLY=true` or `NEXT_PUBLIC_DEMO_ONLY=true`,
  `/api/workspace/[action]`, `/api/paypal/test`, `/api/paypal/test/[action]`,
  `/api/paypal/agent-checkout`, `/api/paypal/agent-checkout/[action]` and
  `/api/paypal/webhooks` reject immediately with HTTP `403`, `/api/paypal/agent`
  continues rejecting `mode=gemini` with HTTP `403` while allowing deterministic
  policy simulation, and `GET /api/workspace` returns an empty read-only HTTP
  `200` snapshot (`PUBLIC_DEMO_READ_ONLY`, `Cache-Control: no-store`).
- **Client-side public demo lockdown (`PUBLIC_DEMO_ONLY`):** disables the
  `"Live Gemini API Inference"` button in `PayPalAgentConsole`, replaces
  `/paypal-test` and `/agent-checkout` owner-test login forms with read-only
  cards showing the verified Task05J `$6.00 USD` PayPal Sandbox receipt
  (`6U113515L79775315` / `0V581522H50035631`) and zero password inputs, displays
  a top-level public read-only notice, and disables continuous `/api/security-demos`
  (1s) and `/api/workspace` (2s) polling in `SecurityDemos` and
  `WorkspaceProvider`.
- **Upload & secret exclusion:** added `.vercel/` to `.gitignore` and created
  `.vercelignore` excluding `.env`, `.env.*`, `web/.env*`, `agent/.env*`,
  `contracts/.env*`, `.tools`, `web/.tools`, `.agent-state`, `.neon`, `*.pem`,
  `*.key`, keystores, logs, contract build artifacts, videos and Playwright
  outputs (`npx vercel deploy --dry --json` confirmed `376` upload files with `0`
  secret/state files).
- **Vercel project setup & handoff to user:** created isolated Vercel Hobby
  project `samuelid22/earmark-paypal` (`prj_3gx7TVFqc97WAUy2C2FoyEzot5yC`,
  `framework: nextjs`, `rootDirectory: web`, `nodeVersion: 22.x`,
  `installCommand: cd .. && npm ci --include=dev`,
  `buildCommand: cd .. && npm run build --workspace @flint/web`), leaving legacy
  `earmark` (`https://earmark-omega-virid.vercel.app`) untouched. Set 12
  non-secret `Config` flags (`NEXT_PUBLIC_DEMO_ONLY=true`,
  `EARMARK_PUBLIC_DEMO_ONLY=true`, `PAYPAL_ENVIRONMENT=sandbox`,
  `PAYPAL_BACKEND_ENABLED=false`, `PAYPAL_PAYMENTS_ENABLED=false`,
  `PAYPAL_TEST_CHECKOUT_ENABLED=false`, `PAYPAL_AGENT_CHECKOUT_ENABLED=false`,
  `EARMARK_GEMINI_ENABLED=false`, `AI_ENABLE_NETWORK=false`,
  `AGENT_MODEL_PROVIDER=mock`, `AGENT_MODEL_MODE=mock`,
  `EARMARK_ENABLE_TESTNET_EXECUTION=false`) and zero secrets/keys/DB URLs. An
  initial CLI deployment (`dpl_5xE7WffghUgXFFkUWriMw488A3s5` at
  `https://earmark-paypal.vercel.app`) confirmed HTTP `200` on `/` and HTTP
  `403`/`404` across all 15 privileged endpoint probes before `/security` timed
  out on `networkidle` due to the 1-second `/api/security-demos` 404 poll (fixed
  above). A second CLI deployment watcher
  (`https://earmark-paypal-caz1n1bi6-samuelid22.vercel.app`) was cancelled
  immediately when the user requested to run the deployment directly; complete
  hosted browser verification on the user's final deployment remains a next step.

Verification run and results:

- `npx --workspace @flint/web vitest run paypal-gemini-agent hosted recorded-demo security-recordings security-demos theme-console`:
  passed 6/6 files, 71/71 tests.
- `npm run typecheck` and `npm run lint`: passed.
- `NEXT_PUBLIC_DEMO_ONLY=true EARMARK_PUBLIC_DEMO_ONLY=true npm run build --workspace @flint/web`:
  passed.
- `node scripts/check-web-boundary.mjs` and `npm run paypal:secrets:check`:
  passed (`52` browser chunks, `339` tracked / `387` candidate files, `0`
  credential matches).
- `node scripts/preview-smoke.mjs`: passed across all 8 production routes, 4
  `Demo Mode` scenarios, 4 `PayPal Agent · Policy` scenarios, Task05J `$6.00`
  receipt (`6U113515L79775315` / `0V581522H50035631`), mobile layout (`390x844`)
  and `0` browser exceptions.
- `npm run paypal:db:verify`: passed read-only
  (`checksum: eaa2680ae6a842456989b3895b944b73d4e1fd551a5ee66161ed836c42ba21ad`,
  unchanged row counts `5/3/32/1/6/5/1/0`).
- `node scripts/source-integrity.mjs verify ..\project-flint .tools\source-integrity.json`:
  passed (`305` file hashes unchanged).
- `npm run format:check` and `git diff --check`: passed.
- Remaining tasks: user runs final Vercel deployment, verifies hosted URL
  (`/` and `/security` scenarios, receipt, mobile layout, zero console errors)
  and records hackathon demo video (plus separately authorized Git commit/push if
  desired).

### Task06 — 2026-11-02 — investigation of the existing implementation

User explicitly requested investigation only. Read both AGENTS.md files and the
active handoff; reviewed existing scenario fixtures, isolated memory repository,
canonical authorization policy, agent tools, immutable intent binding, capture
binding, API route and the recorded/security/PayPal consoles. No application,
configuration, dependency, script or test changes were made. Only this handoff
was edited; the existing browser runner refreshed ignored local screenshots
`.tools/paypal-preview-desktop.png` and `.tools/paypal-preview-mobile.png`.

- **A / normal purchase: PASS.** `web/src/lib/paypal-agent.ts` records the
  Task05J completed order/capture and 1000 authorized / 600 consumed / 0 reserved /
  400 available minor units. `gemini-console.tsx` and `recorded-demo.tsx` display
  this historical receipt explicitly read-only, separate from a synthetic $4
  policy walkthrough. Browser assertions verified both receipt identifiers.
  This is bundled evidence of the earlier verified transaction, not a fresh
  PayPal GET or database reconciliation.
- **B / prompt injection: PASS for the implemented policy demonstration.**
  A deterministic adversarial selection is rejected as `UNAPPROVED_MERCHANT`;
  strict tool schemas and forbidden payment tools are covered by the passing
  tests. This demonstrates independent enforcement when an unsafe proposal is
  attempted, not a new live-model prompt-injection evaluation.
- **C / invalid delivery: PASS for the implemented pre-proposal safeguard.**
  A mismatched offer commitment is rejected as `INVALID_DELIVERY_COMMITMENT`.
  `computeOfferArtifactCommitment` hashes offerId, merchantId, dataset, SLA and
  schema; it does not hash or inspect delivered payload bytes. Immutable checkout
  term binding, approval gates and canonical capture binding exist. The PayPal
  UI explicitly discloses absent post-capture payload inspection,
  delivery-conditional escrow and automatic refund/dispute reversal. Legacy EVM
  recorded escrow evidence is separate and must not be described as PayPal
  fulfillment protection.
- **D / budget exhaustion: PASS.** The deterministic UI rejects $4 against $2
  remaining with `BUDGET_EXHAUSTED`; the targeted regression also rejects $6
  against a Task05J-equivalent $4 remaining, without a persistent reservation.
  These use synthetic active mandates. The actual completed campaign's immutable
  expiry, 2026-11-01T01:38:09.179Z, has now elapsed; the receipt's $4 accounting
  balance is not permission to spend or reuse that expired mandate.

Fresh checks: `node ../node_modules/vitest/vitest.mjs run paypal-gemini-agent
recorded-demo security-recordings security-demos theme-console` from `web` passed
**5 files / 63 tests, zero failures or skips**. Gemini transports are mocked;
scenario accounting uses isolated memory repositories. Node initially hit a
sandbox `EPERM` before execution; rerunning outside that filesystem restriction
passed. `node scripts/preview-smoke.mjs`, with public-demo mode and all live
payment/model execution flags disabled, initially hit the same sandbox issue,
then failed preview readiness with `PREVIEW_START_FAILED`. A subsequent run
passed: eight production routes, four recorded controls, four PayPal policy
verdict assertions, historical receipt, mobile layout and zero page exceptions.
Browser routing allowed only same-origin GETs. Startup failure cause remains
undetermined; a passing rerun does not explain it. The rerun exited normally;
an identity-checked cleanup found it already exited and stopped no process.

No Gemini or PayPal API calls, production deployment, commit, push, financial
mutation or project-flint modification. No persistent database connection or
fresh financial fingerprint comparison was performed; prior database/hash
evidence above remains historical. The reviewed/executed paths do not access
persistent financial records. No full rebuild, full suite or new source-integrity
scan was necessary for this documentation-only investigation. Local demo behavior
is verified; the final hosted deployment/browser result remains unverified in
this session. Record using PayPal Agent · Policy and retain its synthetic/recorded
labels and delivery-scope disclosure. Final documentation formatting/diff checks
are recorded below.

Handoff Prettier check and `git diff --check` passed.

### Task07B — 2026-11-02 — Airy theme integration

Read repository instructions, active handoff and installed Next.js CSS,
server/client component and first-paint guides. Inspected existing theme,
navigation, shared cards, dashboard and Gemini/checkout consoles. Read the Figma
design-to-code skill and stageshow guidance. Figma node 3:2 could not be fetched
through the web tool; the plugin is listed installed but exposes no Figma tools
in this chat, with inconsistent installation/permissions discovery results.
Requested reference access/details while continuing independent theme migration.

Initially modified `web/src/lib/theme.ts`,
`web/src/components/theme-provider.tsx`, `web/src/app/layout.tsx` and
`web/test/theme-console.test.ts`: Airy is the default and SSR/first-paint theme;
Classic Light keeps stored `light`; old `dark`/`system` and invalid preferences
migrate to `airy` using existing `earmark-theme` storage. Removed OS color-mode
subscription and Dark/System options. Added targeted first-paint/migration and
blocked-storage checks. Visual integration and validation remain in progress;
no claim of Figma fidelity yet. No backend or financial record change.

Figma tools became available during the session; successfully read node 3:2,
including its screenshot and complete design context. Access is no longer a
blocker. Added `web/src/app/airy.css` using Design B's surface/text/action colors,
rounded cards, shadows and responsive layout, scoped to `data-theme="airy"` so
Classic Light's existing stylesheet remains untouched (only its selector widens
to fit the new name). Updated `web/src/components/navigation.tsx` with Airy labels
and a Security link while retaining Classic labels. Updated
`web/src/components/gemini-console.tsx` to reuse the existing synthetic policy
evaluation in a natural-language conversation and embedded proposal presentation;
Airy defaults to PayPal policy mode, Classic retains the recorded-demo default.
The chat composer is explicitly a local draft, not connected free-form inference;
existing authenticated live controls are unchanged and payment buttons remain
disabled. Recorded $4 balance is identified as historical accounting, separate
from the simulation. Applied stageshow's hierarchy/spacing/real-component guidance
without adding its mock UI kit, dependencies or fictional model responses.
Initial targeted theme suite passed 25/25; final checks remain pending.

Extended existing `scripts/preview-smoke.mjs` for Airy/Classic Light persistence,
legacy Dark/System migration under OS dark, all nine current static routes,
conversation draft/no-inference feedback and disabled payment controls, while
retaining recorded/PayPal scenario and responsive checks. No new test framework.
Targeted six-file regression run passed 78/78; web TypeScript check passed.
Targeted Biome lint initially caught an effect dependency issue; fixed the effect
to wait for the current storage snapshot before applying/persisting the theme,
then lint passed (four pre-existing informational template-literal suggestions,
zero errors/warnings). Production build and browser/visual verification pending.

Production Next.js webpack build subsequently passed, including agent prebuild,
web TypeScript and all page generation. Compiled browser-boundary scan passed:
52 JavaScript chunks without server credential variable names/private-key PEM
material. Browser verification is running against that build with public-demo
flags enabled and live model/payment flags disabled; only local GETs permitted.

First updated production browser smoke passed all nine routes, both appearance
preferences/migration under OS dark, navigation, four recorded and four PayPal
scenario verdicts, local draft/no-send feedback, disabled payments and mobile
overflow checks, with zero page exceptions. Reviewed actual desktop/mobile and
Classic screenshots. Corrected the new Airy heading weights and explicit system
font fallback, and moved the mobile conversation before the full historical
budget/privacy cards while retaining all content. Extended existing smoke checks
to verify heading weight/mobile order and capture the page from the top. Final
rebuild/browser pass pending after these presentation-only refinements.

Final refined production build and existing browser smoke both **passed**.
Verified all nine static application routes (workspace, mandates, new mandate,
payments, activity, security, resolve, PayPal test and agent checkout), desktop
1440px/mobile390px layouts, both selectable themes and reload persistence,
Dark/System migration while OS dark is emulated, navigation links, all four
recorded and all four PayPal policy verdicts, local-only draft feedback, disabled
payment controls, heading weight and conversation-first mobile ordering. Zero
browser page exceptions; external requests and non-GET requests blocked. Reviewed
the final desktop/mobile images alongside the Figma reference; no design raster
was embedded in the app and no new assets/dependencies/frameworks were needed.
Design typography uses a local Inter/system sans-serif fallback, not a downloaded
font. Original `web/src/app/globals.css` was not changed; dormant Dark selectors
cannot be selected through the new theme API/bootstrap/UI.

Final checks: six targeted test files **78 passed / zero failed / zero skipped**;
web typecheck and both production builds passed (agent prebuild included);
targeted UI/script lint, formatting and `git diff --check` passed after the documented effect fix;
final compiled browser-boundary scan passed across **52** JavaScript chunks.
No full financial/database integration suite was rerun for presentation changes.

Affected repository files for this task: `web/src/lib/theme.ts`,
`web/src/components/theme-provider.tsx`, `web/src/app/layout.tsx`, added
`web/src/app/airy.css`, `web/src/components/navigation.tsx`,
`web/src/components/gemini-console.tsx`, `web/test/theme-console.test.ts`,
`scripts/preview-smoke.mjs` and this handoff. Builds refreshed generated
`agent/dist`, `web/.next` and incremental TypeScript metadata. Existing smoke
runner created/refreshed ignored local evidence:
`.tools/paypal-preview-desktop.png`, `.tools/paypal-preview-mobile.png`,
`.tools/paypal-airy-conversation.png`,
`.tools/paypal-airy-conversation-mobile.png`,
`.tools/paypal-classic-desktop.png` and `.tools/paypal-classic-mobile.png`.

Remaining functional gap: arbitrary natural-language instructions are **not**
connected to live inference; saving a draft neither calls Gemini nor changes the
displayed synthetic evaluation. Existing owner-authenticated bounded Gemini and
checkout controls/backend remain intact, with no new AI backend, policy/privacy
change or payment opt-in. No database connection/write or fresh financial hash
comparison was performed; all checks used mocks, local memory or read-only demo
routes. No Gemini/PayPal API operations, new campaign/intent/reservation,
historical financial mutation, project-flint modification, deployment, commit or
push. Runtime preview children exited through the existing runner's cleanup.

### Task07B — 2026-11-02 — local preview for owner design review

User requested the app running locally. Verified no listener on ports3000/3032;
started the existing production Next.js workflow as a hidden, loopback-only
server at `http://127.0.0.1:3032`, PID10800, build
`gA3_CQMLiKuTLTD3fUtuZ`. This is a public-demo-only preview with all live Gemini,
payment, owner-checkout and legacy execution flags disabled; the agent launcher
was not used because it enables configured Gemini and rotates owner sessions.
No owner authentication files or earlier agent-server metadata were changed.

Created local runtime metadata `.tools/paypal-airy-preview.json` and stdout/
stderr logs `.tools/paypal-airy-preview.log` and
`.tools/paypal-airy-preview-error.log`; no application source/configuration change.
Verified the listener belongs to PID10800, homepage HTTP200 contains Airy and
read-only-demo markup, payment status disabled, and both agent-checkout and live
Gemini GET guards return403. Initial checkout guard GET hit its10-second cold
timeout; bounded30-second read-only recheck passed. Requested opening the local URL
in the Codex browser panel (queued). Server remains running for review. No Gemini
inference, PayPal operation, database write, deployment, commit, push or
project-flint change. Gemini can run locally through the existing authenticated
bounded workflow; deployment is not required and does not connect the draft-only
free-form chat automatically.

### Task07C — 2026-11-02 — typed purchasing chat and offline verification

Replacing the Airy draft-only form with an explicit authenticated Gemini chat,
separate from the recorded/deterministic policy demo. Reuses the existing native
Gemini adapter, tools, independent policy, final synthetic outbound guard and
owner/Host/Origin/CSRF protections. New chat evaluation uses only eligible approved
synthetic offers and a disposable in-memory mandate, with reservation disabled;
it does not load the durable checkout repository or persist an intent. Historical
expired mandates remain untouched. Owner checkout remains the established,
separately authorized workflow; a chat message grants no payment authority.

Affected paths so far: `web/src/lib/paypal-agent.ts`,
`web/src/server/paypal/agent.ts`, new `web/src/server/paypal/agent-chat.ts`,
`web/src/server/paypal/agent-checkout-http.ts`,
`web/src/app/api/paypal/agent-checkout/[action]/route.ts`,
`web/src/components/gemini-console.tsx`, new
`web/src/components/purchasing-chat.tsx`, and `web/src/app/airy.css`.
Public-demo lockdown remains enforced. Offline targeted tests and browser checks
are pending; no live inference or database/financial operation is authorized.

Offline progress: first focused run passed76 tests across5 files. Expanded run
passed99 across7 files, including existing checkout/payment guards. Initial
TypeScript exact-optional-property errors and new lint accessibility/test warnings
were corrected; TypeScript and scoped lint now pass (two pre-existing informational
template-literal suggestions remain). Formatting passed. Added
`web/test/paypal-agent-chat.test.ts` and updated existing
`scripts/preview-smoke.mjs` to intercept chat transport, verify instruction-dependent
$4/$6 responses, explicit mock labeling, rejection/error/loading, public lockdown
and mobile layout. A final direct disposable-accounting assertion is being run.
Stopped only verified Earmark preview PID10800 before rebuilding; production
compilation/typecheck passed, final generation/browser checks remain pending.

Completion evidence:

- Exact typed text is preserved in the existing agent objective, with no fixed
  replacement instruction. Strict POST body accepts only `instruction` (nonblank,
  at most1000 characters, within existing2048-byte request limit). Existing
  server rate limit, session, Host, Origin, CSRF and public-demo guards apply.
  New GET chat session discovery returns CSRF without loading durable checkout.
- Existing evaluator accepts a bounded chat instruction, filters its synthetic
  catalog to policy-eligible approved offers, and sets `reserveOnProposal=false`.
  Its test mandate is disposable with one-hour validity, unrelated to the expired
  persistent campaign. Final transport validation covers the complete native
  conversation/tool continuations, rejects forbidden canaries before dispatch,
  and additionally forbids configured owner/session/login/merchant values.
- `agent-chat.ts` returns only the chat projection, omitting historical financial
  metadata. Injected transport is labeled `MOCKED_TRANSPORT_TEST`; production
  uses `LIVE_GOOGLE_API`, with no simulated fallback on Gemini errors. UI shows
  loading, comparisons, policy checks, proposal/rejection and sanitized failures;
  a failed/new request clears the earlier proposal. Each instruction starts its
  own disposable evaluation. No automatic workflow retry or conversation storage.
- Chat proposal links to the unchanged `/agent-checkout` owner workflow, rather
  than converting text into approval or manufacturing a durable intent. A fresh
  active campaign and separately authorized validated durable intent are still
  needed for future checkout. Payment execution remains disabled by default.
- Targeted runs:76/76 across5 files initially;99/99 across7 expanded files
  (`paypal-agent-chat`, `paypal-gemini-agent`, `paypal-gemini-boundary`,
  `paypal-agent-recovery`, `paypal-agent-checkout`, `paypal-agent-payment`,
  `theme-console`), then11/11 chat tests after adding the direct zero-accounting
  assertion (100 distinct passing cases across these runs). No failures/skips in
  these runs. Native mocked HTTP calls prove changed instructions select $4 or
  $6 offers, strict arguments and privacy rejection stay enforced, and even
  disposable balances remain1000 available/0 reserved/0 consumed.
- Web `tsc --noEmit`, scoped Biome lint, scoped Prettier and production Next build
  passed. Build refreshed `agent/dist`, `web/.next` and incremental TS metadata.
  Initial TS/lint issues above were fixed, not suppressed. No full-suite or live
  provider rerun was needed. `git diff --check` passed (Git emitted only a CRLF
  normalization notice for this handoff).
- Production browser smoke passed9 routes at desktop1440 and mobile390 widths,
  theme persistence/migration, four recorded and four PayPal policy scenarios,
  public live-chat lockdown, typed mocked requests, distinct $4/$6 proposals,
  controlled loading, policy rejection, timeout feedback, clearing stale proposal,
  checkout link and disabled payment button. Zero browser exceptions or horizontal
  overflow. All external requests and mutation POSTs were blocked; chat responses
  were intercepted in the browser only. Native adapter/guard/policy integration
  is independently exercised in Vitest, not claimed from browser fixtures.
- Visual inspection found a browser mock summary still referring to the original
  $4 fixture when showing its $6 branch. Corrected only the smoke fixture summary
  and failed-check flag for its rejection branch; screenshot refresh is underway.
- Existing credential scan passed:339 tracked files,391 candidate files and52
  browser chunks; zero credential matches, no secret env tracked, local env
  ignored, no values printed. No network or database operation in this scan.
- Reloaded only verified Earmark preview PID10800 into PID13448 using the existing
  hidden production Next workflow, preserving owner auth files/session epoch.
  Refreshed ignored `.tools/paypal-airy-preview.json`, `.tools/paypal-airy-preview.log`
  and `.tools/paypal-airy-preview-error.log`. Current build is
  `bl_rH1nvM_CsSLQsEVsw6`; actual local HTTP checks: home200 with Live Gemini chat
  selector, chat session403, paymentsEnabled=false, listenerPID13448.

All11 affected source/test/documentation paths are named above (including this
handoff). Existing smoke runner refreshed ignored desktop/mobile Airy/Classic
screenshots under `.tools/` named in Task07B. No new campaign, mandate, intent,
financial reservation, payment attempt, PayPal order/capture, live Gemini request,
Neon connection/write, historical mutation, project-flint change, deployment,
commit or push. No fresh authoritative Neon comparison was performed: preservation
is supported by no DB operations and tests proving chat never calls checkout.
Remaining limits: synthetic weather catalog only; one independent instruction
per evaluation; current preview intentionally blocks live inference. Separately
authorized live verification is ready through the existing authenticated profile,
not through the public demo, with payment execution kept disabled.

Final browser refresh after that fixture-only correction passed again with the
same9-route desktop/mobile checks and zero browser exceptions. Corrected desktop
and mobile screenshots were regenerated; desktop visual review confirms the
mock summary no longer names the wrong offer. All Task07C verification is
complete; no implementation or verification work remains pending.

### Task07B-FIX — 2026-11-02 — Design B page composition

Read the actual Figma Design B frame3:2 and its screenshot. It places the
introduction/budget and chat in two columns directly below navigation. Confirmed
that the existing long notice, legacy landing heading and Execution Console
heading pushed the purchasing UI down. Changes underway only in presentation:
`web/src/components/dashboard.tsx` relocates the legacy introduction/help controls
below the Airy workspace (Classic Light order preserved); primary/secondary
heading markup in `web/src/components/gemini-console.tsx` and dashboard; compact
Airy-only demo notice in `web/src/app/layout.tsx`; scoped frame/spacing, two-column
layout and compact conversation mode controls in `web/src/app/airy.css`.
Simulation and historical-accounting labels remain visible. No agent, payment,
policy, authentication or database behavior changes. Browser verification pending.

Verification progress: existing theme/UI suite passed25/25 tests with no skips;
scoped Biome lint passed (three existing informational template-literal notes),
Prettier and `git diff --check` passed. Extended the existing
`scripts/preview-smoke.mjs` with full-homepage geometry checks and screenshots at
1440,1280,1024,390 and375 pixels: compact notice, primary content near navigation,
two desktop columns, legacy introduction below, hidden redundant console heading
and no horizontal overflow. Production compilation and TypeScript passed; final
build completion and browser checks are pending. Only verified preview PID13448 was stopped for build;
owner credentials, sessions and all financial data remain untouched.

Completed: production build including agent compilation and web TypeScript passed.
Existing browser smoke passed9 routes, Airy/Classic selection/persistence/migration,
four recorded and four PayPal policy scenarios, mocked chat/error/rejection states,
and disabled execution, with zero browser exceptions. Five full-page composition
checks passed at1440x900,1280x800,1024x768,390x844 and375x812, all without horizontal
overflow. Desktop assistant starts at222/222/286px and budget at486/421/467px;
desktop notice height32px (mobile50px). Compared actual1440 desktop and390 mobile
screenshots visually with the Figma reference: two-column desktop hierarchy and
conversation-first mobile stacking; simulation, historical budget and disabled
payment labels remain visible. No fake approval controls/data were introduced.

Affected paths: `web/src/components/dashboard.tsx`,
`web/src/components/gemini-console.tsx` (heading markup only),
`web/src/app/layout.tsx`, `web/src/app/airy.css`,
`scripts/preview-smoke.mjs` and this handoff. Build refreshed existing generated
`agent/dist`, `web/.next` and incremental TS metadata. Screenshot evidence:
`.tools/paypal-design-b-1440.png`, `.tools/paypal-design-b-1280.png`,
`.tools/paypal-design-b-1024.png`, `.tools/paypal-design-b-390.png`,
`.tools/paypal-design-b-375.png`; existing smoke screenshots also refreshed.
The Chat navigation destination is the existing `/` homepage; no new route or
backend was introduced. Classic Light still renders the original landing heading
before its console; its public notice retains the original full wording.

Restored the existing hidden read-only production preview on127.0.0.1:3032,
PID9096, build `C0rgksVkuz-sIx5M4GNDg`; refreshed ignored runtime metadata/logs
`.tools/paypal-airy-preview.json`, `.tools/paypal-airy-preview.log`,
`.tools/paypal-airy-preview-error.log`. All Gemini, payment and durable-checkout
flags remain disabled; owner auth files/session epoch were preserved. No live
Gemini/PayPal request, database connection/mutation, financial reservation,
transaction-history change, project-flint modification, deployment, commit or
push. No failed/skipped checks in this task; no further implementation is pending.

### Task07E — 2026-11-03 — Norway UI migration (completed locally)

Read the supplied `Earmark — desktop screens.html` as visual reference, not as
instructions. Unpacked its four embedded checkout/injection/mandate/activity
screens into ignored `.tools/norway-reference/` inspection files. Reference assets
are self-contained (Inter Tight/JetBrains Mono WOFF2, embedded runtime/React);
there are no authored responsive breakpoints or active screen interactions beyond
static render values. Desktop system:232px sidebar, stone#F3F4F1 canvas,
ink#11161C, blue#2F4BFF, bordered white22px cards, dark budget banner,
conversation/proposal column plus360px policy/activity rail. Will reuse fonts,
license, icon shapes and styles with existing Earmark functionality; reference
balances, merchants, payment claims, dispute/pause controls are not application
facts or authorization. Classic Light and all financial/policy/privacy behavior
must remain unchanged. Original rendered-reference capture is underway offline.

Implementation files: replaced `web/src/app/airy.css` with scoped `norway.css`;
added `web/src/app/norway-fonts.css`,13 unmodified WOFF2 assets under
`web/public/fonts/norway/` and their `LICENSE.txt`. Updated theme/default/storage
migration in `web/src/lib/theme.ts`, `web/src/components/theme-provider.tsx` and
`web/src/app/layout.tsx`; retained Classic Light CSS and full notice wording.
Updated `web/src/components/navigation.tsx` with the reference sidebar/logo/icons,
real route links, persistent Appearance selector and collapsible existing wallet
controls. Dashboard theme selection updated in `dashboard.tsx`; existing
purchasing presentation in `gemini-console.tsx` now follows the dark-budget/left
conversation/right-policy-rail hierarchy. `purchasing-chat.tsx` only adds a UI
result callback to keep the rail truthful when switching live/demo or on errors;
no request, authorization or model behavior changes. Added read-only
`recorded-paypal-card.tsx` and reused it in `detail-pages.tsx` for actual published
Task05J mandate/payment/activity evidence instead of fictitious reference records.
Updated `web/test/theme-console.test.ts` and existing
`scripts/preview-smoke.mjs` for Norway migration and layout verification.

Reference rendered offline with original bundled assets, fonts loaded and zero
external requests/browser errors. Initial off-screen iframe screenshot timing left
one blank artifact; refreshing captures after explicit scrolling/paint settling.
Scoped lint passed (four existing informational style notes); targeted tests and
TypeScript are running. No backend, database, accounting or permission changes.

Checks so far:89/89 targeted tests across6 files passed (theme, chat, native
Gemini/privacy, recorded demo and public lockdown); web TypeScript and scoped
lint passed. Corrected original reference captures now all contain rendered
content (checkout170958/injection123870/mandates112811/activity80971 bytes), not
blank iframes; inspected original checkout, mandate and injection visuals. Full
production build is running with all live/network/payment flags off. No listener
was found on3032, so no process was terminated. Existing reference example
mandates/inline form and escrow/dispute state will not be copied as live data:
actual mandate creation remains its owner-gated existing workflow, and actual
PayPal capture history is explicitly separate from legacy delivery escrow.

First production build and browser smoke passed:9 routes, five widths, both themes,
all existing scenario controls and mocked chat comparison/rejection/error states;
no horizontal overflow or browser exceptions. Visual comparison identified header
alignment/mobile spacing and mandate two-column composition improvements. Reused
`create-mandate.tsx` in the Norway mandate sidebar via an embedded presentation
option only; all review/confirmation/owner guards are unchanged, with genuine
unconfigured-vault state in the public preview. `detail-pages.tsx` now labels
Norway Mandates/Purchases/Activity while Classic labels stay unchanged. Added the
reference cloud icon to existing `glass.tsx`, copied the exact reference Gemini
SVG, and refined its alignment/price typography. Full original form remains at
`/mandates/new`; no template sample vault/configuration was fabricated.

Two new price-span ARIA lint errors and then two decorative-SVG lint errors were
found and corrected, without suppressions. The standalone TypeScript recheck
passed; final scoped lint/build and refreshed visual verification are underway.
No further native model/backend implementation changes were needed.

Final production build passed, including web TypeScript. All final scoped lint and
formatting checks pass (four pre-existing informational style notes only).
Credential/source/browser scan passed:339 tracked files,407 candidates,53 browser
chunks; zero credential matches, no tracked secret environment, no values printed.
All13 font byte comparisons matched the attachment and the original license is
present. Final browser capture/verification is running on the corrected build.
No full-suite/database test run was needed for these presentation changes.

Final build passed and read-only preview started on3032, PID9512, build
`dymugckhFI1Drqtu7271R`; Gemini/payment/durable checkout disabled, no owner-session
rotation. Final smoke retry hit a30-second `page.goto` load-event timeout on its
first homepage navigation, before UI assertions; its temporary preview exited via
cleanup. First smoke pass remains valid for the earlier build, but final visual
verification is not yet claimed. Investigating document/font/asset readiness on
the actual9512 server before retrying. Runtime metadata/logs are
`.tools/paypal-norway-preview.json`, `.tools/paypal-norway-preview.log`,
`.tools/paypal-norway-preview-error.log`.

Final-build smoke passed unchanged on retry after the isolated startup timeout:
9 routes, five widths, theme persistence/migration, existing scenarios and mocked
chat states; zero overflow/browser exceptions. Actual3032 server loaded fully in
2196ms with fonts loaded, no pending/failed requests and HTTP200; chat403 and
paymentsEnabled=false. The timeout's exact cause remains undetermined.

Final screenshot review then found long synthetic merchant text touching its
price. Added a constrained wrapping span in both existing proposal views and a
browser geometry assertion for merchant/price collisions. Only presentation
changed; lint/formatting pass. Verified preview PID9512 was stopped for rebuilding
this small correction; replacement build/screenshot verification is pending.

Completion: the corrected production build and unchanged existing browser smoke
passed, including merchant/price separation at1440/1280/1024/390/375px,9 routes,
Norway/Classic Light persistence, saved Airy migration, OS-dark independence,
four recorded and four PayPal policy scenarios, intercepted typed-chat loading,
comparison/rejection/error states and no stale policy verdict. No horizontal
overflow or browser exceptions.89 targeted tests across6 files, standalone
TypeScript, scoped lint/formatting and production build pass. The final credential
scan again found zero matches (339 tracked files,407 candidates,53 browser chunks).
The earlier isolated page-load timeout remains unexplained; it did not recur in
the final smoke. No full regression or database suite was rerun for this UI task.

The final read-only preview is `http://127.0.0.1:3032`, verified listening PID11684,
build `qoWQ6D8BgMMrMTtzaf81X`. Fresh HTTP checks: homepage200 with Norway default,
public chat endpoint403, paymentsEnabled=false. Six refreshed comparison captures
from this build report fonts loaded, zero browser exceptions and no overflow;
all outbound non-local requests and mutation requests were blocked in the capture
browser. Runtime metadata/log paths remain as above. No owner credentials/session
rotation, database connection/write, Gemini request or PayPal operation occurred.
No deployment, commit, push or project-flint modification.

Original HTML browser captures: `.tools/norway-reference-checkout.png`,
`.tools/norway-reference-injection.png`, `.tools/norway-reference-mandates.png`,
`.tools/norway-reference-activity.png`. Matching implementation captures:
`.tools/norway-implemented-checkout.png`, `.tools/norway-implemented-injection.png`,
`.tools/norway-implemented-mandates.png`, `.tools/norway-implemented-activity.png`.
Mobile captures: `.tools/norway-implemented-mobile.png` and
`.tools/norway-implemented-mobile-conversation.png`. All are ignored local artifacts.

Necessary differences: real published Task05J accounting and actual synthetic
offers replace fictitious template balances/merchants; longer policy/security
copy makes cards taller. Historical $4 unused authority is explicitly not a fresh
spending mandate. Mandate creation reuses the genuine owner-controlled legacy EVM
form, with an honest unconfigured state in this public preview. No fabricated
PayPal delivery escrow/challenge/dispute, pause-agent action, profile menu or
keyboard authorization shortcuts. Actual owner approval and disabled payment
controls remain. Existing Purchases route, appearance selector and wallet controls
are retained. Mobile stacking is an adaptation because the source is desktop-only.
No new dependencies or financial/backend changes. Stop after local verification.

### Task07E follow-up — 2026-11-03 — remove extra Norway sections

User requested removal of the legacy content shown below the supplied screenshot
and closer adherence to the HTML mandate/workspace composition. Changed only
`web/src/app/norway.css`: hide the duplicate execution-mode controls, legacy
simulation controls, trust-boundary console, lifecycle/evidence blocks, landing
introduction/history and footer below the Norway homepage conversation. Hide the
extra legacy mandate list/empty state and footer on Norway Mandates. The existing
policy-demo controls remain accessible at Policies; Classic Light is unaffected.
The compact synthetic/read-only labels, policy rail, real recorded mandate,
existing chat and owner/payment controls remain visible. No financial, model,
authorization or stored-data change. Updated `scripts/preview-smoke.mjs` to assert
the extra panels are hidden and exercise the retained scenario controls on
Policies. Build and browser verification pending.

Production build (including TypeScript) passed. Verified and stopped only the
previous project preview PID11684, then started the read-only replacement on3032:
PID12040, build `bpacqwk-_OUQGIHRn2MOP`. Fresh homepage HTTP200 and
paymentsEnabled=false. Direct desktop1440/mobile390 checks and four full-page
captures passed with zero browser exceptions or horizontal overflow:
`.tools/norway-clean-checkout-desktop.png`,
`.tools/norway-clean-checkout-mobile.png`,
`.tools/norway-clean-mandates-desktop.png`,
`.tools/norway-clean-mandates-mobile.png`. Extra console controls/body, mandate
legacy heading/list and both page footers are hidden in Norway. Classic Light and
the policy scenarios remain in their existing views. Formatting, scoped JS lint
and diff whitespace checks pass. Direct CSS lint reported46 stylesheet style
warnings (important styles/specificity); no broad stylesheet cleanup performed.
The initial browser smoke expected the now-removed introduction below the chat;
updated this assertion and moved scenario exercise to Policies. A second run then
exposed its mobile reload returning to the default security rail; changed that
navigation explicitly to the homepage. Direct screenshot capture initially hit
the5s policy-loading wait; captures passed after waiting for the existing result.
Final smoke is running. No live Gemini, PayPal, database or project-flint actions.

Final smoke passed:9 routes, five viewport widths, hidden extra-panel assertions,
Norway/Classic Light persistence and migration, four recorded/four PayPal policy
scenarios, mocked typed-chat proposal/rejection/error states, public chat lockdown
and disabled payments, with no browser exceptions. External services/mutations
were blocked. Follow-up completed locally; no deployment, commit or push.

### Task07E logo follow-up — 2026-11-03

User requested replacing the Norway placeholder paper icon with Earmark's real
logo. `web/src/components/navigation.tsx` now reuses the existing compact `Brand`
component and unchanged local `/brand/earmark-crystal.png` asset next to the Norway
wordmark. `web/src/app/norway.css` sizes it to32px with no tile, radius or shadow;
multiply blending integrates its white background with the stone sidebar. Classic
Light branding remains unchanged. No assets, financial/auth/model code, records
or dependencies modified. Build and focused desktop/mobile verification pending.

Production build and TypeScript passed; formatting and scoped navigation lint
passed (one existing informational template-literal note), as did diff whitespace
checks. Replaced only verified project preview PID12040 with PID10776 on3032,
build `GgYKS2Q13OibjBORMAz59`, retaining all public-demo/live/payment-disabled
flags. Focused browser verification passed: real local logo loaded at32x32px,
transparent unframed container, multiply blend, desktop1440/mobile390, no overflow,
Classic Light unchanged, theme switching working, paymentsEnabled=false and zero
browser exceptions. Screenshots: `.tools/norway-real-logo-desktop.png` and
`.tools/norway-real-logo-mobile.png`; ignored preview metadata/logs refreshed.
No additional regression suite needed for this logo-only change. No Gemini,
PayPal, database mutation, deployment, commit, push or project-flint modification.

### Task07F — 2026-11-03 — one authenticated live Norway chat evaluation

Authorized one synthetic-only purchasing evaluation, no payment or persistence.
Reviewed instructions, current chat/auth/native Gemini path and final outbound
guard.31 existing chat/boundary tests passed offline. Existing owner/merchant
configuration and Gemini key/model presence passed without values printed.
Public preview chat403 confirmed. TLS/read-only PostgreSQL baseline recorded
hashes/counts for all8 PayPal tables (no row data logged); auth-file hash retained.
Preparing the existing private Next development profile on loopback3032, with
database URLs removed and all payment/durable execution flags disabled, preserving
the public production build for restoration. Ignored local
`.tools/task07f-trace.mjs` observes sanitized HTTP timings, native validated
decisions and complete guarded request metadata only; no raw bodies/headers or
private identifiers are recorded. Baseline artifact is
`.tools/task07f-baseline.json`. No live invocation dispatched at this stage.

Outcome: stopped during `PRIVATE_UI_PREFLIGHT`, before any owner login POST or
chat POST. No submission marker was created; sanitized transport trace contains
zero Google dispatches, zero native decisions and no model response. No live HTTP
status/latency, API-authentication result, comparison or policy proposal exists
for Task07F. No retry or second evaluation was started. The catch recorded only
the generic Error type/stage, not the original exception detail; this limits root
cause diagnosis and must not be called a Gemini timeout/auth/quota failure.

Before that stop, the exact requested instruction passed the existing final
serialized outbound guard, including its local canary checks, using an offline
intercept:3849 bytes, exactly5 permitted tool declarations, unchanged instruction,
zero network requests. Native client settings remained60000ms per turn,8 turns,
maxAttempts1. The private profile withheld all database URLs and disabled payment
execution; the normal authenticated chat handler was reused without mocks or
auth bypass. That does not establish successful browser authentication or live
privacy validation. A separate read-only page capture confirmed Norway and one
live-chat button; it shows initial policy loading, not an actual Gemini result.
Screenshot `.tools/task07f-preflight-redacted.png` masks historical balance and
recent-transaction panels. No further attempt to log in or submit was performed.

Fresh after-check passed: TLS-verified, repeatable-read/read-only PostgreSQL hashes
match every row in all8 PayPal tables; counts approved_merchants5/attempts3/audit32/
environment1/idempotency6/mandates5/schema_migrations1/webhook_events0. Owner auth
file hash is unchanged. Thus no campaign, mandate, intent, financial reservation,
attempt, order/capture association or audit mutation occurred. No PayPal request.
Private Next processes were stopped as a verified isolated tree. Restored the
unchanged production read-only preview on3032 (PID7216, build
`GgYKS2Q13OibjBORMAz59`): fresh homepage200, chat403, paymentsEnabled=false.
Next dev temporarily changed `web/next-env.d.ts` route imports; restored its exact
production imports, with no remaining diff in it, tsconfig or web/AGENTS.md.

Only tracked documentation changed in this session. Ignored diagnostic artifacts:
`.tools/task07f-trace.mjs`, `.tools/task07f-trace.jsonl`,
`.tools/task07f-browser.mjs`, `.tools/task07f-baseline.json`,
`.tools/task07f-private-server.json`, `.tools/task07f-private-server.log`,
`.tools/task07f-browser-failure.json`, `.tools/task07f-ui-preflight.json`,
`.tools/task07f-preservation.json`, `.tools/task07f-preflight-redacted.png`;
existing `.tools/paypal-norway-preview.json` and its two log files were refreshed.
No credentials, raw Google payloads, headers or real private identifiers logged.
No build, broad suite or app refactor needed;31 targeted offline tests and diff
whitespace check passed. No deployment, commit, push or project-flint change.
Remaining blocker: diagnose the browser/private-chat preflight with better error
capture before a newly instructed live attempt; this session sent no evaluation.

### Task07F-P — 2026-11-03 — diagnose browser preflight, no inference

Reviewed Task07F and its runner. `.tools/task07f-browser.mjs` now has explicit
operation stages, sanitized exception message/stack and HTTP/browser diagnostics,
and a `--preflight-only` mode that cannot submit the purchasing instruction or
dispatch a chat POST. Browser launch is inside error capture. Added ignored
`.tools/task07fp-deny-network.mjs` to reject all non-loopback fetches in the private
profile; Gemini flags/key and database URLs will also be disabled. Existing auth,
privacy and application behavior remain unchanged. Reproduction pending.

Reproduced the original symptom with the original navigation/click ordering:
`OWNER_LOGIN_FORM` failed at
`getByRole('region', {name:'Gemini purchasing conversation'}).getByLabel('Owner login secret').toBeVisible()`:
30000ms timeout, element not found. Sanitized exception message, stack and failed
request diagnostics are preserved in `.tools/task07fp-reproduced-failure.json`
(and `.tools/task07fp-browser-failure.json`). No browser runtime error, chat-session
GET, login POST or chat POST occurred before that failure. Server startup and
homepage/assets succeeded; an aborted root request and second homepage navigation
were observed. This isolates the failure before authentication, not to Gemini,
owner credentials, database connectivity or merchant policy.

Minimal runner correction: wait for the existing client-rendered purchase proposal
before clicking Live Gemini chat, instead of relying only on DOMContentLoaded and
the SSR theme attribute. Corrected preflight passed: login form appeared, existing
owner login POST200, authenticated session GET200 and CSRF present, empty textarea
enabled and Send disabled. Zero chat POSTs; no instruction filled. Evidence supports
a client-readiness/development-reload race in the harness. The exact browser event
that discarded the first click was not retained in the original07F artifact; no
application defect is established. Corrected diagnostics show development rebuilds
and an expected StrictMode-aborted discovery request followed by normal401/login200.
No auth, privacy, financial or application logic was changed. Screenshot:
`.tools/task07fp-authenticated-chat-redacted.png`, cropped to the authenticated
conversation, with no credentials or historical finance panels. Private process
has no Gemini key, AI network disabled, DB URLs empty and payments disabled;
non-loopback fetch blocker recorded no Google or PayPal attempts.

Completion: restored public read-only production preview on3032, PID972, unchanged
build `GgYKS2Q13OibjBORMAz59`. Focused public browser check passed: homepage200,
Norway chat explicitly disabled, Send disabled, public chat GET403 and empty-body
POST403, payment-test GET403, paymentsEnabled=false, zero runtime errors. The POST
tested the public guard with `{}` only; no purchasing instruction was submitted.
Owner-auth file hash and production build ID match their before values. Private
profile had no DB URLs/connections and made no financial mutation. No Gemini or
PayPal fetch was attempted;8 other development external fetches were blocked.
No key, cookie, CSRF value, request body or private financial record was logged.
Next's temporary `web/next-env.d.ts` development imports were restored exactly;
it, tsconfig and web/AGENTS.md have no remaining diff. No product source changed.

Affected ignored local paths: modified `.tools/task07f-browser.mjs`; added
`.tools/task07fp-deny-network.mjs`, `.tools/task07fp-private-server.json`,
`.tools/task07fp-private-server.log`, `.tools/task07fp-blocked-network.jsonl`,
`.tools/task07fp-browser-failure.json`, `.tools/task07fp-reproduced-failure.json`,
`.tools/task07fp-result.json`, `.tools/task07fp-authenticated-chat-redacted.png`,
`.tools/task07fp-public-verification.json`. Existing
`.tools/paypal-norway-preview.json` and its stdout/stderr logs were refreshed.
Only tracked change is this handoff update. Syntax and whitespace checks passed;
restricted Node's first syntax invocation reported EPERM and the elevated local
check passed (not the browser failure). No build or unrelated suite was run.
Ready for the previously authorized single evaluation when instructed to resume;
it remains unperformed. No deployment, commit, push or project-flint change.

### Task07F-R — 2026-11-03 — resume the unused single live evaluation

Reviewed07F/07F-P and reused the repaired client-readiness/authentication runner.
No prior submission marker or Google dispatch exists. Fresh TLS/read-only hashes
of all8 PayPal tables and owner-auth file recorded in ignored
`.tools/task07fr-baseline.json`; counts unchanged5/3/32/1/6/5/1/0 in schema order.
Gemini key/model presence confirmed without values. Existing full-request privacy
guard and canary checks remain mandatory; typed chat still uses only disposable
synthetic policy with reserveOnProposal=false. Preparing the private loopback
profile using the existing `.tools/task07f-trace.mjs` observer, not07F-P's blanket
network blocker;60000ms per turn,8 turns, maxAttempts1, no database URLs or payment
permissions. No application/UI/source change or new infrastructure.

Completed the single authorized evaluation through the real Norway UI using the
repaired client-ready sequence and existing owner login/CSRF. Exactly1 chat POST,
no workflow retry. Exact submitted instruction (unchanged in every Google request
and the returned objective):

> Find the most cost-effective approved weather-data provider within my $10 spending limit, with a delivery SLA of no more than 15 minutes. Compare eligible offers and prepare a purchase recommendation for my approval. Do not execute payment.

Actual chat HTTP200,7153ms end-to-end, source LIVE_GOOGLE_API. Six real Google
HTTP200 responses, each one candidate/finishReason STOP, no safety block, timeout,
abort or HTTP retry. Google API authentication succeeded. Native calls, in order:
readSpendingMandate, listApprovedMerchants, compareEligibleOffers, proposePurchase,
readAuthorizedPaymentStatus, followed by the strict finish response. Body-complete
latencies by turn:1576/586/892/1186/816/1116ms; response-header latencies:
1568/583/889/1182/781/1112ms. Native argument/finish acceptance is evidenced by the
existing strict adapter completing successfully; the observer's optional model
prototype hook did not emit separate validatedDecision records under Next, so no
such records are claimed. The actual transport and returned policy result were
inspected without logging raw model requests/responses or native signatures.

Both offers were genuinely evaluated from the approved synthetic catalog:
US Telemetry Backup Corp600 USD minor units,10-minute SLA; US Weather Prime
Telemetry400 USD minor units,5-minute SLA. Gemini selected the latter as the
lowest-priced eligible offer. Independent verdict:
POLICY_VALIDATED_HUMAN_AUTHORIZATION_REQUIRED,10/10 checks passed. The real model
explanation, comparison, $4 proposal and Human authorization required badge were
visually verified in Norway; Payment execution disabled remains displayed.
ownerAuthorized=false, persisted=false, fundsReserved=false. No expired campaign
was reused: this is a disposable $10 test policy with no financial authority.

Privacy/runtime evidence: existing final boundary.validate and proveCanaries ran
before each of the6 Google dispatches, including complete conversation history.
The observer independently confirmed exact instruction, exactly5 permitted tool
declarations and no configured credential/real-owner/merchant credential values
in each serialized payload.15 cumulative function-response checks across the
continuations (5 unique responses); historical payment-status metadata is excluded
by the existing strict synthetic response schema and forbidden-value checks.
Request sizes3849/5037/6991/8214/10327/10998 bytes. API key remained only in the
required server-side authentication header. No raw bodies/headers, credentials,
historical buyer/payment records or private identifiers were logged or sent as
model content. No blanket07F-P blocker loaded; only the existing scoped observer
permitted Google and loopback fetches. No privacy or authorization guard changed.

Fresh TLS/read-only PostgreSQL after-check matched every row hash in all8 tables
against `.tools/task07fr-baseline.json`; counts5/3/32/1/6/5/1/0 unchanged, owner-auth
file hash unchanged. No campaign, mandate, financial intent, reservation, attempt,
order/capture, audit or historical accounting mutation. No PayPal operation.
Private process had all DB URLs withheld and all payment execution flags disabled.
Stopped only its verified process tree and restored public preview on3032,
PID5204, unchanged production build `GgYKS2Q13OibjBORMAz59`. Fresh public checks:
homepage200, chat GET403, empty-body chat POST403, paymentsEnabled=false.
No instruction was submitted to the public endpoint. Next's temporary
`web/next-env.d.ts` dev imports restored; no diff in it, tsconfig or web/AGENTS.md.

Artifacts: added `.tools/task07fr-baseline.json`,
`.tools/task07fr-private-server.json`, `.tools/task07fr-private-server.log`,
`.tools/task07fr-preservation.json`, `.tools/task07fr-summary.json`,
`.tools/task07f-submission.json` (one-shot marker), `.tools/task07f-result.json`,
`.tools/task07f-chat-redacted.png`; appended `.tools/task07f-trace.jsonl` and
refreshed `.tools/paypal-norway-preview.json` plus stdout/stderr logs. All ignored
local artifacts; only tracked documentation changed. The screenshot is cropped
to synthetic chat/result, excluding owner login and historical financial panels.
No new tests/build/dependencies/refactor/UI change needed for this verification;
source integrity and whitespace checks passed. No deployment, commit, push or
project-flint change. Public demo remains intentionally read-only; production
owner authentication and deployment remain separate work. Live inference over
synthetic offers does not establish live merchant procurement or payment approval.
Single evaluation authorization consumed; stop with zero financial/DB mutations.

### Task07G — 2026-11-03 — public Norway demo readiness audit

Reviewed project instructions,07E/07F records, public route guards, Norway screens,
Git status, `.vercelignore`, Next tracing and local Vercel link (earmark-paypal).
No app-blocking defect identified so far and no application changes made. Added
`docs/task-07g-public-demo-readiness.md` with the visitor flow, scope limitations
and Vercel website/Git/environment checklist. Legacy `docs/deployment.md` describes
testnet database/contracts, not this read-only website; checklist explicitly
distinguishes it. Remote Vercel dashboard settings remain unverified; no deployment.

Fresh4-file targeted offline suite passed58 tests (theme, recorded demo, public
policy/Gemini/payment guards and hosted boundary). Scoped lint across102 files
failed on46 existing CSS warnings, with29 informational notes and no reported
errors; no unrelated lint cleanup. Current Git has48 modified tracked paths and54
untracked entries, including required Norway/agent/security sources/assets; it is
not publication-ready until reviewed and explicitly authorized. Read-only
project-flint Git-status baseline saved to ignored `.tools/task07g-git-baseline.json`.
Stopped only verified preview PID5204 for a production build from `web`, using
VERCEL=1 and explicit demo/live/payment-disabled flags. Build/typecheck and final
browser verification are pending. No real Gemini/PayPal/DB operation was run.

Completed: production build from `web` with VERCEL=1 and read-only flags passed,
including TypeScript. Started replacement public preview on3032, PID10524,
build `NlpOWH-OSouO48j7T3nxi` with hosted mode simulated. Existing browser smoke
passed9 production routes at1440/1280/1024/390/375px, Norway default and saved
Classic Light/migration behavior,4 recorded and4 PayPal scenarios, explicitly
mocked typed-chat loading/comparison/rejection/error states, public chat lockdown,
disabled payments, no overflow/runtime exceptions. No real Gemini was repeated.

Separate actual-public browser audit (no fake chat responses) passed: clear
synthetic/simulation labels, offer comparison on Policies, owner-authorization
explanation, historical receipt on Mandates/Activity, live chat disabled with no
owner-login input.11 API/live/privileged/mutation probes403 and5 local-secret-file
probes404; mutation probes used only empty `{}` payloads and were rejected before
any service/provider/storage action. Public workspace reports unconfigured,
geminiAvailable=false, empty current records and PUBLIC_DEMO_READ_ONLY; payments
disabled. Existing simulation versus historical/live distinctions are honest.
Invalid-delivery scenario explicitly covers commitments/immutable terms, not
delivered-goods inspection or PayPal delivery escrow. Resting/hover button colors
were checked after a transition-frame screenshot ambiguity and are correct.

Credential scan passed:339 tracked files,408 candidates,53 browser chunks, zero
credential matches, no tracked secret environment, local environment ignored;
browser source boundary scan passed53 chunks. Git working tree is main with48
modified tracked paths and55 untracked entries, nothing staged. Required new
Norway/fonts/security/agent files remain unpublished. Agent workspace realpath is
inside this checkout; original project-flint Git-status hash unchanged. No DB was
accessed in this audit and no financial/persistent record or authorization changed.
The prior07F-R real inference remains historical evidence, not this public
simulation or a newly authorized live call.

Final verdict: PASS local public-demo functionality/protection; publication/HOSTED
deployment HOLD. No critical runtime/security defect found, no app code modified.
Lint `--error-on-warnings` remains non-clean on46 existing CSS style warnings;
it was run and failed, not waived or suppressed. Remote Vercel dashboard settings
have not been verified: local link names earmark-paypal, no vercel.json exists,
Next tracing and CLI exclusions protect local state. Checklist records Next/web
root, Node22, workspace source inclusion, install/build commands, required nonsecret
Preview/Production flags and explicit omission of all live keys/auth/DB/signers.
Official Vercel docs checked; exact remote install/build/deployment and hosted URL
checks remain separate authorization. No commit, push, deployment or project-flint
modification. Formatting of the new report and diff whitespace checks pass.

Affected documentation: added `docs/task-07g-public-demo-readiness.md`; this handoff
updated. Ignored local artifacts added: `.tools/task07g-git-baseline.json`,
`.tools/task07g-git-verification.json`, `.tools/task07g-public-audit.json`,
`.tools/task07g-checkout.png`, `.tools/task07g-mandates.png`,
`.tools/task07g-activity.png`, `.tools/task07g-security.png`,
`.tools/task07g-mobile.png`. Existing preview metadata/stdout/stderr and smoke
screenshots refreshed by the unchanged existing runner. No other source changes.

## 2026-11-04 — Task07H publication-readiness audit (in progress)

Reviewed Task07G and instructions. All46 scoped warnings are in the new,
untracked `web/src/app/norway.css` (absent at HEAD); the unchanged Biome rules
fail on warnings. Task07G called these existing because they preceded that
session, not because they were present at HEAD. Auditing all117 changed paths
(48 modified,69 untracked files). No staging, publication, provider calls or
database access authorized. A targeted Norway CSS correction and read-only
publication inventory are in progress; final results follow below.

Task07H progress: added `docs/task-07h-publication-readiness.md` with the exact
118-file publication inventory (48 modified,70 untracked including the report),
local-only exclusions, lint baseline evidence and verified/unverified Vercel
settings. Corrected31 selector-order warnings and15 !important warnings only in
`web/src/app/norway.css`; no lint rules or other application logic changed.
Same102-file scoped Biome check passes (29 infos); repository-wide274-file Biome
check passes (184 infos), both zero warnings/errors. Stylesheet Prettier passed.
339 tracked /408 candidate /53 browser-chunk configured-credential scan: zero
matches;333-file generic token/private-key scan: zero matches. Synthetic test
URL/email canaries manually distinguished from secrets. Production build and
focused visual validation remain in progress.

Task07H final verification: production website build from web passed, including
agent prebuild, Next webpack and TypeScript, with explicit public-read-only flags
and VERCEL=1. Existing browser smoke passed9 routes/five widths, both themes and
migration, navigation,4 recorded plus4 PayPal scenarios, explicitly mocked chat
states, public chat lockdown, disabled payments, no overflow/runtime exceptions.
Eight Norway source-cascade comparisons (/,/mandates;1440/390px; normal/reduced
motion) covered1368 visible elements with zero computed-style differences.
The optional Classic computed-style extension failed its local30s server-start
deadline; this is not a passed comparison. Classic production smoke/screenshots
passed. Earlier auxiliary startup/nav/proposal-selector timeouts and stdin/shell
probe issues were not accepted as checks; no application guards changed.

Final credential scan:339 tracked/409 candidates/53 browser chunks, zero matches;
browser source boundary also passed53 chunks. Both root lint components passed
(repository Biome274 files,0 warnings/errors,184 infos; Forge fmt --check exit0).
Scoped Biome102 files passes with29 infos. Fonts:40 declarations reference13
valid local WOFF2 files, licenses retained. Other115 reviewed source files hash
unchanged; final Git48 modified/70 untracked, nothing staged. project-flint
status matches07G with the same git status --short format (using untracked=all
in an early probe produced a non-comparable hash, not evidence of a change).
No database read/write or provider operation; no financial records/authority
changed. No persistent preview was running on3032 at preflight; verification
used temporary owned public servers only. Complete CI/regression/DB suites were
not repeated for CSS; prior07G tests remain prior evidence.

Publication remains HOLD only for actual remote Vercel configuration confirmation
and explicit Git/deployment authorization. No connector/usable CLI auth was found;
remote repo/production branch,root/framework/Node,workspace inclusion,install/build
commands,environment flags and triggers are unverified. Preserved existing
commands;07G's install suggestion is not a verified remote value. Confirm these
settings and both public-demo environments before any push: Git integration may
automatically deploy Preview or Production. No staging,commit,push,deployment.

Affected nonignored paths: web/src/app/norway.css; added
docs/task-07h-publication-readiness.md with exact118-file publication inventory,
local-only exclusions, objective lint baseline correction, actual validation,
remote-setting uncertainties and next publication steps; this handoff updated.
Ignored audit/helper artifacts (no sensitive request bodies):

- .tools/task07h-final.mjs
- .tools/task07h-git-verification.json
- .tools/task07h-inventory-classified.json
- .tools/task07h-inventory-initial.json
- .tools/task07h-lint-after.json
- .tools/task07h-lint-before.json
- .tools/task07h-lint-css-after.json
- .tools/task07h-lint-scoped-after.json
- .tools/task07h-norway-before.css
- .tools/task07h-source-preservation.json
- .tools/task07h-style-compare.mjs
- .tools/task07h-style-comparison.json
- .tools/task07h-validation.json
  Existing ignored browser evidence refreshed by the unchanged smoke runner:
- .tools/norway-mandates-desktop.png
- .tools/norway-mandates-new-desktop.png
- .tools/norway-payments-desktop.png
- .tools/norway-activity-desktop.png
- .tools/norway-agent-checkout-desktop.png
- .tools/norway-paypal-test-desktop.png
- .tools/norway-mandates-mobile.png
- .tools/norway-payments-mobile.png
- .tools/norway-activity-mobile.png
- .tools/norway-agent-checkout-mobile.png
- .tools/paypal-norway-1440.png
- .tools/paypal-norway-1280.png
- .tools/paypal-norway-1024.png
- .tools/paypal-norway-390.png
- .tools/paypal-norway-375.png
- .tools/paypal-norway-conversation.png
- .tools/paypal-norway-conversation-mobile.png
- .tools/norway-injection-desktop.png
- .tools/paypal-preview-desktop.png
- .tools/paypal-preview-mobile.png
- .tools/paypal-classic-desktop.png
- .tools/paypal-classic-mobile.png

## 2026-11-04 — Task07I interactive judge sandbox (in progress)

Inspected Norway chat, native Gemini adapter/final synthetic privacy guard, real
policy tools and public/owner boundaries. Public live Gemini is blocked pending
shared cross-instance admission quotas and provider-cost controls; current process
counters are insufficient. Implementing an isolated, request-local synthetic
policy sandbox with explicitly mocked deterministic planning, and a separately
authenticated loopback judge Gemini path using existing tools/auth. No real
Gemini invocation, financial operation, persistent record or database access is
authorized. Public owner checkout protections remain unchanged. Files/checks and
final outcomes will be recorded below.

Task07I progress: added web/src/server/paypal/judge-sandbox.ts and judge-http.ts
plus web/src/app/api/judge-sandbox/route.ts; reused the existing agent tools and
policy engine with isolated memory repositories and reserveOnProposal=false.
Updated web/src/server/paypal/agent.ts for server-parsed tighter synthetic
requirements and synthetic-only observations (historical anchors are not even
attached); gemini-boundary.ts permits reductions within the unchanged600-minor
ceiling only. Updated test-auth.ts with a separate judge cookie namespace; no
owner config/credentials are used. Updated web/src/lib/paypal-agent.ts,
web/src/components/purchasing-chat.tsx and gemini-console.tsx for judge input,
comparison/trace/policy labels and an explicitly synthetic10-dollar/zero-used
budget; historical receipts remain separate. Updated scripts/preview-smoke.mjs
for actual deterministic judge POSTs and clearly intercepted Gemini UI tests.
Added web/test/judge-sandbox.test.ts. The first test run had one wrong expected
legacy budget verdict (72pass/1fail); corrected to actual BUDGET_EXHAUSTED.
Latest six-file suite101/101 passes. Initial scoped lint found6 new non-null
assertion warnings; fixed them rather than suppressing rules. Further build,
browser, formatting, source/credential checks and final evidence remain pending.

### Task07I — final implementation and verification

Implemented the authorized safe fallback. Public Norway Judge sandbox accepts
actual typed instructions through /api/judge-sandbox, with a labeled mock planner
and the existing native tools/canonical policy engine. Three real HTTP/UI cases
select Prime at400 minor, Backup at600, or reject a300-minor ceiling with
TRANSACTION_LIMIT_EXCEEDED; a2-minute SLA yields OBJECTIVE_MISMATCH. Scope,
financial-execution and override errors are explicit boundary rejections, not
fabricated model responses. Numeric USD ceilings, minute SLA and backup preference
are supported; this deterministic parser is not general language understanding.
Each request owns fresh memory-only synthetic policy; no persistent campaign,
intent, attempt or reservation is created. Human approval is always absent.

The separately authenticated local judge mode reuses native Gemini and the final
synthetic guard. It uses its own cookie and separate judge secrets, never owner
auth files/credentials, and is denied on hosted profiles. Local bounds:1000 input
characters,8192-byte/five-second body bounds,8 model steps,60s per turn/180s
transport deadline,one HTTP attempt,one active evaluation,3 evaluations/session
and12/process/hour. Those counters are local only, not public admission controls.
Public Gemini remains unconditionally blocked across instances; enabling it
requires separate hosted judge authentication, atomic shared request/token/cost
quotas and concurrency leases, provider-approved cost ceiling and edge abuse
controls. No service/configuration was provisioned or live key enabled.

Fresh results:133/133 tests across8 files pass, no skips; final production build
with TypeScript passes. Updated existing browser smoke passes9 routes/five widths,
Norway/Classic Light and migration, actual3 homepage policy evaluations plus mobile
SLA rejection,4 recorded/4 policy scenarios, explicitly intercepted Gemini UI
states, real hosted-live and owner endpoint403, no overflow/runtime exceptions.
Local judge browser preflight passed with synthetic credentials and server-side
external-network blocking: session/CSRF verified, owner endpoint403, zero model
submissions/provider requests. No real Google authentication/inference was tested.
Configured-secret scan339 tracked/414 candidates/54 chunks:zero matches, env
ignored; client boundary now covers judge-secret names and passes54 chunks.
Source workspace is inside this checkout; project-flint status matches preflight.
Final lint passes278 files with zero errors/warnings (187 informational notices); changed-source/report formatting and whitespace checks pass.

Failures corrected rather than suppressed: initial wrong legacy budget-code
assertion (72pass/1fail); six new non-null lint warnings; privacy regression
(50pass/1fail) caught static receipt IDs in the deterministic judge trace before
browser publication. Fixed all judge tools to synthetic-only and removed internal
anchors for synthetic observations; privacy tests now prove returned data and
full outbound turns omit historical IDs. No historical data was sent to Google.
An initial scan invocation lacked --import tsx; the proper scan passed. Browser
run initially reached the new cases then failed on a stale mobile tab label;
updated the runner and the full smoke passes. Final source was rebuilt after the
privacy and authentication/evaluation loading-state correction. No DB suites or
full unrelated regression suite was run; no DB connection/write or financial
operation occurred. No staging,commit,push,deployment or project-flint modification
was performed by this task. Observed Git HEAD35133d5; prior07H publication inventory
is historical and must not be reused without reviewing this new work.

Affected paths (all changes and compatibility described in the task report):
web/src/app/api/judge-sandbox/route.ts; web/src/server/paypal/judge-http.ts;
web/src/server/paypal/judge-sandbox.ts; web/src/server/paypal/agent.ts;
web/src/server/paypal/gemini-boundary.ts; web/src/server/paypal/test-auth.ts;
web/src/lib/paypal-agent.ts; web/src/components/purchasing-chat.tsx;
web/src/components/gemini-console.tsx; web/test/judge-sandbox.test.ts;
scripts/preview-smoke.mjs; scripts/paypal-secret-check.ts;
scripts/check-web-boundary.mjs; added docs/task-07i-judge-sandbox.md; this handoff.
Norway CSS/theme/font/logo and financial service/accounting logic remain unchanged.
Ignored local artifacts: .tools/task07i-baseline.json, .tools/task07i-lint.json,
.tools/task07i-judge-desktop.png, .tools/task07i-judge-mobile.png,
.tools/task07i-local-auth.mjs, .tools/task07i-no-network.mjs,
.tools/task07i-local-auth-result.json, .tools/task07i-local-judge-auth.png,
.tools/task07i-verification.json. Existing smoke screenshots refreshed at the
22 paths listed in Task07H's browser-evidence entry (no new credentials/private
request bodies). All temporary owned test servers closed. No persistent local
preview or public deployment is claimed.

Task07I final gate: repository-wide Biome278 files passes, zero warnings/errors
(187 informational notices). Formatting of all14 changed source/test/script/report
paths passes; Git diff whitespace check passes. Final verification metadata is
.tools/task07i-verification.json. No new dependency or financial authority.
Public judge interaction is real deterministic policy execution with a labeled
mock planner; the local Gemini adapter was tested with offline native transports
only. Public live Gemini requires the infrastructure and separately authorized
verification in the task report. Stop after local verification.

### 2026-11-04 — Task07J local offer discovery (verification in progress)

Added web/src/server/paypal/offer-discovery.ts and web/src/lib/offer-discovery.ts:
research-only Search/native collector schema, exact final request envelope guard,
no private history/tool responses, bounded input, one60s request/no retry, source
validation, explicit claims/unknowns, canonical authorize() rejection of unbound
external merchants. Existing approved catalog/financial policy are unchanged;
no external merchant has an approved immutable offer binding. There is no path
from web claims to a payable offer or synthetic Sandbox purchase.

Modified agent/src/models.ts only to opt into Google Search and a3000-token
research response; existing purchasing sessions retain600 tokens and their
unchanged synthetic guard. Modified web/src/server/paypal/judge-http.ts to reuse
separate loopback judge session/CSRF/quotas and add disabled-by-default discovery.
Hosted/default profiles deny it. Modified web/src/components/purchasing-chat.tsx
and added web/src/components/offer-discovery.tsx for Norway research mode, cited
links, billing/availability/delivery/PayPal uncertainty, no proposal/approval, and
sandboxed CSP-restricted search-suggestions HTML. Classic/shared theme CSS intact.
Added web/test/offer-discovery.test.ts; modified scripts/preview-smoke.mjs with
explicitly stubbed research cards, iframe isolation and actual public discovery
403 checks. This handoff records the work; no additional task report was created.

Fresh targeted suite:197/197 across11 files, no skips. Includes23 new discovery
cases, three distinct instructions, full-envelope canaries/mutations, unsafe or
missing citations, missing prices/SLA, unsupported PayPal, unapproved merchants,
budget rejection, injected instructions, strict tool/schema, no HTTP retry,
authentication/CSRF/hosted denial and shared local quotas. Initial run96pass/8fail
used stale compiled workspace agent; rebuilding the package resolves mismatch
without relaxing guard. Initial scoped lint caught4 explicit-any warnings and
one index-key error; fixed with typed mutations and deduplicated offer keys.
Final scoped lint8 files and agent typecheck pass. Production build/Next
TypeScript passes. Browser and credential scan results pending below. No live
Google/Search, PayPal or database operations, deployment, staging, commit or push.

Task07J final results: production build including Next TypeScript passes; separate
agent typecheck passes. Scoped Biome8 files:zero warnings/errors. Formatting all8
changed source/test/script paths passes; git diff --check passes (only an existing
CRLF normalization notice).197 tests/11 files pass with no skips; no full-suite
or PostgreSQL rerun was needed. Existing browser runner passes9 routes, widths
1440/1280/1024/390/375, Norway/Classic persistence/migration, three actual public
policy HTTP evaluations, four recorded/four real policy scenarios, and mocked
Gemini/research UI states. Actual hosted discovery/Gemini/owner calls return403.
Research fixture is explicitly labeled offline; source links/unknown PayPal,
no proposal, disabled payment and CSP/sandbox script blocking verified. Desktop/
mobile screenshots inspected at .tools/task07j-discovery-desktop.png and
.tools/task07j-discovery-mobile.png. Existing smoke screenshot paths were also
refreshed by the existing runner (same paths as Task07I/07H evidence). Temporary
owned preview closed; no persistent server was started or unrelated process killed.
Configured-secret scan:339 tracked/418 candidates/54 chunks,zero matches; env
ignored/untracked. Client-boundary scan54 chunks passes. Git index remains empty.
No writes outside this repository, no project-flint modification, no new dependency.
No DB client/read/write, live Gemini/Search or PayPal execution was used. Financial
preservation is by absence of DB/payment access, not a newly claimed Neon audit.

Offline examples (invented fixtures, NOT current merchant offers): affordable
weather under$10 returns a500-minor/month claim and rejects a1200-minor option
against the research ceiling; both remain ineligible. Approved providers/PayPal
request returns400-minor claim but unsupported acceptance is downgraded to unknown.
15-minute service request with missing price/SLA shows unknowns/insufficient
evidence. Canonical authorize() rejects priced external candidates as
UNAPPROVED_MERCHANT. Additional research budget/SLA checks never grant authority.
No immutable commitments, merchant IDs or checkout approval are fabricated.
There are currently zero eligible real offers: approved catalog identities are
synthetic Sandbox bindings only. Future real merchant onboarding/immutable terms
verification requires its own authorized work; search names/URLs cannot create it.

Live readiness/prerequisites (NOT executed): separately authorize one local
research evaluation; run the existing application bound to127.0.0.1:3032, without
hosted-provider markers; retain NEXT_PUBLIC_DEMO_ONLY/EARMARK_PUBLIC_DEMO_ONLY=true
and disabled PayPal backend/payments/owner-checkout profiles. Set server-only
EARMARK_JUDGE_LOCAL_GEMINI=true and EARMARK_OFFER_DISCOVERY_ENABLED=true plus
EARMARK_GEMINI_ENABLED=true/AI_ENABLE_NETWORK=true; configure valid Gemini key,
Search/native-function-capable Gemini3 model,60s AI_TIMEOUT_MS and separately
scoped judge login/session secrets (minimum32/48 characters). Authenticate via
Norway Judge sandbox, select Authenticated online offer research and submit one
non-sensitive weather/provider instruction. Existing limits are shared with local
judge Gemini:one active,3/session,12/process/hour; this research path is one native
model turn/one HTTP attempt,3000 output tokens,1MB response,at most5 offers. No
continuation/retry context can add web/private records to another request.
Public mode remains deterministic only; local counters do NOT protect hosted AI.

Live uncertainty remains explicit: key/quota/billing, configured model Search+
function compatibility, actual grounding/native collector output, Google search
suggestions rendering and real offer accuracy have NOT been tested. Missing
native report/grounding fails closed with no replay/fallback. Search can fan out
billable queries. Sources are URL/grounding associations, not independent fact
verification; redirected/uncited sources cannot verify PayPal. Prices may be
stale, recurring, region-specific or omit tax/usage; delivery/availability and
PayPal acceptance remain claims/unknown until independently checked. No external
webpage is fetched by Earmark, no claim is recycled into the synthetic catalog,
and no real provider is described as paid by a Sandbox capture. Google's supported
Search/native-functions and grounding metadata were checked in official docs:
https://ai.google.dev/gemini-api/docs/google-search and
https://ai.google.dev/api/generate-content . No runtime success is inferred from
those docs. Implementation complete for offline verification; stop before live use.

### 2026-11-04 — Task07K single live discovery verification (in progress)

Read root/web instructions and Task07J handoff;3032 is free. Reusing the existing
production build, separate local judge auth, Norway UI and final discovery guard.
Added ignored .tools/task07k-run.mjs and .tools/task07k-trace.mjs by adapting the
existing07I browser/profile and07F transport observer. Temporary process-only
judge secrets/configuration, no owner auth, persistent environment edits or DB
configuration. The observer permits only the exact authorized research request,
one Google dispatch and no other external service; it logs sanitized timing,
status/tool/grounding counts only. Existing app guard remains authoritative.
One-use submission marker prevents accidental rerun; final cleanup will verify
public policy-only settings and stop owned temporary servers. Syntax checks pass.
Expected ignored evidence:task07k-submission.json,task07k-trace.jsonl,
task07k-result.json,task07k-chat-redacted.png. No live submission yet.

Task07K final outcome:FAIL due to provider quota, not a timeout. Submitted the exact
user-supplied monthly$10 weather/PayPal research instruction once through real
Norway UI, separate judge login/session and CSRF. One browser evaluation POST,
one real Google request/attempted model turn; Google429 RESOURCE_EXHAUSTED,
headers781ms/body793ms,application roundtrip981ms. Provider reported exceeded
current quota and suggested checking plan/billing; this does NOT establish billing
as the cause. Application returned400/MODEL_RATE_LIMITED. Zero candidates,
finishReason absent, zero returned native calls/grounding/search-query/source
metadata. No offers, prices, source URLs or PayPal evidence were obtained; all
remain UNKNOWN. Independent offer policy evaluation was not reached, so no live
merchant-policy verdict is claimed. No second diagnostic, model retry or quota
probe was made. No application fix is justified by this external rejection.

Actual final request checks passed before dispatch:exact instruction, research-only
1000-minor USD context, empty observations, Google Search plus only the read-only
reportDiscoveredOffers collector, no history/function responses, no configured
credential values in body. Existing application exact-envelope guard passed;
Google key was used only in its server-side authentication header. Private server
had no DB configuration and payments disabled. No owner secret/history loaded into
model context; no tool-response turn existed. Norway correctly showed the real
MODEL_RATE_LIMITED error, with zero browser runtime errors and no research cards
or purchase proposal. Redacted screenshot inspected:.tools/task07k-chat-redacted.png.

Restoration passed with a temporary safe public profile:policy endpoint200,
discovery403,owner chat403; live/discovery capability metadatafalse. No persistent
environment/config file was edited; original3032 had no listener and both owned
servers were closed afterward. No PayPal request, financial/DB read or write,
merchant approval, persistent campaign/intent/reservation, staging,commit,push,
deployment or project-flint modification. No claim of fresh Neon accounting audit.
Only helper syntax checks and focused auth/browser/public read-only checks ran;
Task07J's197 tests/build results remain prior evidence, not rerun results.
Changed paths:this handoff and the two ignored diagnostic helpers recorded above;
created the four ignored one-use/trace/result/screenshot artifacts listed above.
No credential/raw authentication header/private request body was logged. Next step:
resolve provider quota/model access externally, then obtain new explicit approval
for another single live evaluation. Do not reuse this consumed one-use submission.

### 2026-11-05 — Task07K-FIX Gemini 2.5 Flash search grounding split

Request: configure Earmark's existing research path to use `gemini-2.5-flash` for
Google Search grounding while keeping the purchasing-agent model unchanged; use a
separate search-only model call (because Gemini 2.5 does not support combining
`googleSearch` and `functionDeclarations` in one request) and pass validated
research results into the existing `reportDiscoveredOffers` collector and
independent policy workflow, reusing Task07J's implementation and Norway research
cards, running focused offline tests/build checks only, with no live Gemini,
PayPal, database, git or deployment operations.

Modified files:

- `agent/src/gemini-response.ts`: added optional `googleSearch = false` parameter
  to `parseGeminiResponse`. When `googleSearch` is true, any `functionCall` part
  is rejected (`MALFORMED_FUNCTION_CALL`), and non-thought grounded text
  (`1..20000` chars) is returned as `{ kind: "finish", summary }` alongside
  response diagnostics. Non-search tool-calling and purchasing-agent parsing
  remain unchanged.
- `agent/src/models.ts`: added optional `maxOutputTokens?: 600 | 3000` to
  `GeminiSettings`, sent `tools: [{ googleSearch: {} }]` alone when
  `googleSearch` is true (never combined with `functionDeclarations`), and set
  `thinkingConfig` to `{ thinkingBudget: 0 }` for `gemini-2.5-*` models while
  keeping `{ thinkingLevel: "low" }` and `maxOutputTokens: 600` for `gemini-3-*`
  purchasing-agent requests and `GEMINI_DEFAULT_MODEL = "gemini-3.8-flash"`.
- `web/src/lib/offer-discovery.ts`: updated `OfferDiscoveryResult["evidence"]` to
  support `modelTurns: 1 | 2` and optional `searchModel` / `collectorModel`
  identifiers while keeping Norway research card types unchanged.
- `web/src/server/paypal/offer-discovery.ts`: exported
  `DISCOVERY_SEARCH_MODEL = "gemini-2.5-flash"` and `ValidatedResearchResults`;
  split `discoverOffers` into Turn 1 (`searchClient` on `gemini-2.5-flash`,
  `tools: [{ googleSearch: {} }]`, `maxOutputTokens: 3000`,
  `thinkingConfig: { thinkingBudget: 0 }`) and Turn 2 (`collectorClient` on
  `env.GEMINI_COLLECTOR_MODEL ?? env.GEMINI_MODEL ?? "gemini-3.8-flash"`,
  `tools: [{ functionDeclarations: [reportDiscoveredOffers] }]`,
  `maxOutputTokens: 3000`, `thinkingConfig: { thinkingLevel: "low" }` for
  `gemini-3-*` or `{ thinkingBudget: 0 }` for `gemini-2.5-flash`). Turn 1
  validates `groundingMetadata` (`webSearchQueries`, `groundingChunks`,
  `groundingSupports`, `searchEntryPoint`), extracts public `https://` grounded
  sources via `discoverySource`, and transitions the exact-envelope outbound
  boundary via `boundary.allowCollector(researchResults)` (which enforces
  `researchResultsSchema`, `assertNoSensitiveMaterialInAgentPayload` and prompt-
  injection checks before Turn 2 can dispatch). Citation matching, PayPal claim
  downgrading (`VERIFIED` -> `MENTIONED_UNVERIFIED` without PayPal evidence),
  independent `policyFor` merchant rejection (`MERCHANT_NOT_APPROVED`) and
  `nonBinding: true` remain unchanged.
- `web/test/offer-discovery.test.ts`: updated offline transport fixtures and
  added regression tests covering the two-turn `gemini-2.5-flash` search ->
  `GEMINI_MODEL` collector workflow, rejection of combined `googleSearch` +
  `functionDeclarations` in either turn, rejection of unexpected `functionCall`
  parts or prompt-injection text in Turn 1, and rejection of unsupported
  `GEMINI_SEARCH_MODEL`.
- `HANDOFF-PAYPAL.md`: recorded this change log entry and updated the current
  project state summary.

Checks run and results (all offline):

- `npx --workspace @flint/agent vitest run gemini.test.ts gemini-response.test.ts gemini-body.test.ts`:
  PASS (`3/3` files, `78/78` tests).
- `npx --workspace @flint/web vitest run offer-discovery judge-sandbox paypal-gemini-agent paypal-gemini-boundary`:
  PASS (`4/4` files, `78/78` tests, including `23/23` in `offer-discovery.test.ts`).
- `npm run typecheck`: PASS (`@flint/agent`, `@flint/web` and `api/src/tsconfig.json`).
- `npx biome lint agent/src/models.ts agent/src/gemini-response.ts web/src/lib/offer-discovery.ts web/src/server/paypal/offer-discovery.ts web/test/offer-discovery.test.ts --error-on-warnings`:
  PASS (`5` files checked, `0` warnings/errors).
- `npm run build --workspace @flint/web`: PASS (`14/14` static pages and dynamic routes).
- `node scripts/check-web-boundary.mjs`: PASS (`54` compiled browser chunks, `0` credential or private-key matches).
- `npm run paypal:secrets:check`: PASS (`339` tracked files, `418` candidate files, `54` browser chunks, `0` credential matches).

Skips/restrictions honored: zero live Gemini requests, zero PayPal requests,
zero database reads or writes, no environment file edits, no git commit/push and
no deployment. Next step: when a single live discovery test is separately
authorized, use a fresh one-use runner/observer configured for the two-turn
`gemini-2.5-flash` search -> `GEMINI_MODEL` collector sequence (do not reuse the
consumed single-turn `.tools/task07k-*` gate/observer).

### 2026-11-05 — Task07K-R single live Gemini 2.5 Flash search verification

Request: execute one authorized live end-to-end discovery evaluation using the
existing local Gemini credentials under a hard limit of two Google API requests
(Request 1: `gemini-2.5-flash` with Google Search grounding; Request 2:
configured collector model only if Request 1 succeeds), with no retries,
fallbacks or application changes if an error occurs, then restore public
restrictions and record the result.

Added ignored local helpers and artifacts:

- `.tools/task07kr-run.mjs` and `.tools/task07kr-trace.mjs` (syntax-checked via
  `node --check`; enforces the 2-request hard limit, blocks Turn 2 unless Turn 1
  succeeds with grounded output, and blocks all non-Google external hosts).
- `.tools/task07kr-submission.json`, `.tools/task07kr-trace.jsonl`,
  `.tools/task07kr-result.json`, `.tools/task07kr-chat-redacted.png`.
- No application source, test or configuration files were modified during
  Task07K-R; `@flint/web` was rebuilt with `NEXT_PUBLIC_DEMO_ONLY=true` (and
  `node scripts/check-web-boundary.mjs` passed `54/54` chunks) after an initial
  browser open (`0` UI submissions, `0` Google API requests) timed out waiting
  for the `Judge sandbox` button because the prior build omitted
  `NEXT_PUBLIC_DEMO_ONLY=true`.

Execution and outcome (`FAIL` — external provider model availability):

- Submitted the exact user instruction once through the authenticated Norway
  Judge Sandbox UI (`authenticated: true`, `csrfVerified: true`,
  `uiSubmissionCount: 1`, `liveEvaluations: 1`).
- Outbound privacy/envelope checks passed before dispatch (`exactInstruction:
true`, `isolatedContext: true`, `permittedTools: true` with
  `tools: [{ googleSearch: {} }]` only, `noHistory: true`, `noSensitiveValues:
true`, `applicationFinalGuardReached: true`, `requestBytes: 1374`,
  `databaseAvailable: false`, `paymentsEnabled: false`).
- **Google API Request 1 (`models/gemini-2.5-flash:generateContent`):** HTTP
  `404`, `apiErrorStatus: "NOT_FOUND"`, `headersMs: 775`, `bodyMs: 817`, total
  application roundtrip `durationMs: 1044`. Google API message: `"This model
models/gemini-2.5-flash is no longer available to new users. Please update
your code to use models/gemini-3.8-flash for the latest features and
improvements."`
- **Google API Request 2 (`models/gemini-3.5-flash-lite:generateContent`):** NOT
  called (`1` Google API request total; zero retries or fallback calls).
- Zero candidates, `finishReason: null`, zero tool calls, `groundingPresent:
false`, `searchQueryCount: 0`, `sourceCount: 0`, `supportCount: 0`. All
  online offer, pricing, SLA, availability and PayPal acceptance facts remain
  `UNKNOWN`; no external merchant was approved and independent offer policy
  evaluation was not reached.
- Application returned HTTP `400` (`MODEL_API_ERROR`). Norway UI rendered the
  alert `"Evaluation unavailable: MODEL_API_ERROR. No purchase intent or payment
was created."` with `0` browser runtime errors, no research cards and no
  purchase proposal (`.tools/task07kr-chat-redacted.png`).
- Restoration verified on temporary safe public server (`localGeminiAvailable:
false`, `localDiscoveryAvailable: false`, `publicLiveGemini: false`, policy
  POST `200`, discovery POST `403`, owner chat GET `403`), and all owned servers
  were stopped. Zero PayPal requests, zero DB reads/writes, no git staging/
  commit/push and no deployment. Next step: select a search-grounding model
  available to this Google project/account (such as `gemini-3.8-flash` per
  Google's 404 message, subject to quota) under separate explicit authorization.

### 2026-11-05 — Task07L Tavily Search integration (offline)

Request: replace Google Search grounding in Earmark's discovery workflow with
Tavily's free Search API (`POST https://api.tavily.com/search`) authenticated
server-side via `TAVILY_API_KEY` (`search_depth: "basic"`, `max_results: 5`),
passing sanitized Tavily results (`title`, `url`, `snippet`, `retrievedAt`) into
the existing Gemini `reportDiscoveredOffers` collector, Norway research cards
and independent policy engine, while removing Gemini Google Search grounding,
keeping the purchasing-agent model unchanged, and running offline verification
only.

Modified files:

- `agent/src/gemini-response.ts`: removed the `googleSearch` parameter/branch from
  `parseGeminiResponse`; tool-calling and finish parsing remain unchanged.
- `agent/src/models.ts`: removed `googleSearch` from `GeminiSettings` and
  `GeminiModel.decide` while keeping `maxOutputTokens?: 600 | 3000` (default
  `600` for purchasing-agent requests, `3000` for the offer collector) and
  `thinkingConfig: { thinkingLevel: "low" }`.
- `web/src/lib/offer-discovery.ts`: added `"LIVE_TAVILY_SEARCH"` source and
  `searchProvider?: "tavily"`, `searchResultsCount?: number` evidence metadata.
- `web/src/server/paypal/offer-discovery.ts`: exported `TAVILY_SEARCH_URL =
"https://api.tavily.com/search"` and `TAVILY_MAX_RESULTS = 5`; replaced Gemini
  Google Search grounding with a guarded `POST https://api.tavily.com/search`
  call (`Authorization: Bearer <TAVILY_API_KEY>`, `search_depth: "basic"`,
  `max_results: 5`, `include_answer: false`, `include_raw_content: false`,
  `include_images: false`, single attempt/no retry); validated and sanitized
  Tavily results (`title`, `url` via `discoverySource`, `snippet`,
  `retrievedAt`); enforced `boundary.allowCollector` (`researchResultsSchema`,
  `assertNoSensitiveMaterialInAgentPayload` and prompt-injection checks) before
  calling the existing Gemini `reportDiscoveredOffers` collector (`GEMINI_MODEL`)
  and `policyFor` workflow.
- `web/src/server/paypal/judge-http.ts`: required `Boolean(env.TAVILY_API_KEY)`
  for `localDiscoveryAvailable` and `mode === "discovery"`.
- `web/src/components/offer-discovery.tsx` and
  `web/src/components/purchasing-chat.tsx`: updated discovery header/status copy
  to reference Tavily Search + Gemini and retrieved search result citations.
- `scripts/check-web-boundary.mjs`, `scripts/paypal-secret-check.ts`,
  `.env.example` and `web/.env.example`: added `TAVILY_API_KEY` to browser
  chunk/secret scans and environment templates.
- `web/test/offer-discovery.test.ts`: updated and expanded offline tests (`25`
  cases) covering successful Tavily + Gemini collection across three
  instructions, empty Tavily results and empty collected offers, Tavily/Gemini
  HTTP failures with zero retries (`401`, `429`, `503`), malformed Tavily JSON/
  schemas, secret/prompt-injection rejection in instructions and snippets,
  complete outbound envelope mutation guards, citation/PayPal downgrades, and
  hosted/missing-key/unauthenticated/CSRF/quota enforcement.
- `HANDOFF-PAYPAL.md`: recorded this entry and updated the current project state.

Offline checks run and results:

- `npx --workspace @flint/agent vitest run gemini.test.ts gemini-response.test.ts gemini-body.test.ts`:
  PASS (`3/3` files, `78/78` tests).
- `npx --workspace @flint/web vitest run offer-discovery judge-sandbox paypal-gemini-agent paypal-gemini-boundary`:
  PASS (`4/4` files, `80/80` tests, including `25/25` in
  `web/test/offer-discovery.test.ts`).
- `npm run typecheck`: PASS (`@flint/agent`, `@flint/web`, `api/src/tsconfig.json`).
- `npx biome lint ... --error-on-warnings` (`10` changed files): PASS (`0`
  warnings/errors).
- `npm run build --workspace @flint/web` (with `NEXT_PUBLIC_DEMO_ONLY=true`):
  PASS (`14/14` static pages and dynamic routes).
- `node scripts/check-web-boundary.mjs`: PASS (`54` compiled browser chunks, `0`
  credential or private-key matches).
- `npm run paypal:secrets:check`: PASS (`339` tracked files, `418` candidate
  files, `54` browser chunks, `0` credential matches).

Restrictions honored: zero live Tavily or Gemini calls, zero PayPal operations,
zero database reads or writes, no git commit/push and no deployment. Next step:
populate `TAVILY_API_KEY` in `web/.env.local` (currently unset locally) before a
separately authorized single live Tavily + Gemini evaluation.

### 2026-11-05 — Task07L-R single live Tavily + Gemini discovery verification

Request: verify the real-time offer discovery integration end-to-end with
exactly one live Tavily Search API request (`POST https://api.tavily.com/search`)
and one conditional live Gemini collector API request
(`models/gemini-3.5-flash-lite:generateContent`), with no retries, fallbacks,
PayPal operations, database mutations or git/deployment actions, then restore
public restrictions.

Added ignored local helpers and artifacts:

- `.tools/task07lr-run.mjs` and `.tools/task07lr-trace.mjs` (syntax-checked via
  `node --check`; enforces the hard limit of `1` Tavily request + `1` conditional
  Gemini request, verifies exact outbound envelopes and secret exclusion, and
  blocks all other external hosts).
- `.tools/task07lr-submission.json`, `.tools/task07lr-trace.jsonl`,
  `.tools/task07lr-result.json`, `.tools/task07lr-chat-redacted.png`.
- No application source, test or configuration files were modified during
  Task07L-R.

Execution and verified outcome (`PASS`):

- Confirmed `TAVILY_API_KEY` and `GEMINI_API_KEY` (`GEMINI_MODEL="gemini-3.5-flash-lite"`)
  were present in `web/.env.local` via boolean check without printing values.
- Submitted the exact user instruction once through the authenticated Norway
  Judge Sandbox UI (`authenticated: true`, `csrfVerified: true`,
  `uiSubmissionCount: 1`, `liveEvaluations: 1`, `applicationHttpStatus: 200`,
  `durationMs: 42059`).
- **Tavily Request (`1/1`):** `POST https://api.tavily.com/search`, `418` bytes,
  `searchDepth: "basic"`, `maxResults: 5`, `exactQuery: true`,
  `noSensitiveValues: true`, HTTP `200`, `headersMs: 4352`, `bodyMs: 4469`,
  `resultCount: 5` public `https://` results returned (including Weatherstack
  pricing, Weatherbit pricing, and 2025/2026 weather API comparisons).
- **Gemini Collector Request (`1/1`):**
  `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`,
  `6836` bytes, `exactInstruction: true`, `isolatedContext: true`,
  `sanitizedTavilyResultCount: 5`, `permittedTools: true`
  (`reportDiscoveredOffers` only, no `googleSearch`), `noHistory: true`,
  `noSensitiveValues: true`, `applicationFinalGuardReached: true`, HTTP `200`,
  `headersMs: 37301`, `bodyMs: 37321`, `candidateCount: 1`,
  `finishReason: "STOP"`, `toolCalls: ["reportDiscoveredOffers"]`,
  `strictSchemaValid: true`.
- **Collected Offer & Citations:** `Weatherstack` · `Standard API Plan (up to
50,000 requests)`, `priceMinor: "999"` (`$9.99 USD`, `billing: "Monthly"`,
  `factStatus: "claimed"`), `availability: "Available online via sign up"`,
  `delivery: "Instant digital access upon registration"`, `slaMinutes: null`
  (`unknown`), `paypal: "unknown"` (`paypalEvidence: null`), cited source
  `https://weatherstack.com/pricing` (`cited: true`).
- **Independent Policy Verdict (`policyFor` / canonical `authorize`):**
  `eligible: false`, `canonicalVerdict: "UNAPPROVED_MERCHANT"`, reasons:
  `EXTERNAL_MERCHANT_NOT_BOUND`, `IMMUTABLE_TERMS_UNVERIFIED`,
  `HUMAN_AUTHORIZATION_REQUIRED`, `TRANSACTION_LIMIT_EXCEEDED` (`999` minor >
  `600` minor per-tx cap), `DELIVERY_SLA_UNKNOWN`,
  `PAYPAL_ACCEPTANCE_UNVERIFIED`. `proposal: null`, `ownerAuthorized: false`,
  `persisted: false`, `fundsReserved: false`.
- **Norway UI & Restoration:** Rendered `Tavily Search + Gemini · online research`,
  the `Weatherstack` research card, clickable cited URL, `UNKNOWN` SLA/PayPal
  labels and disabled `Payment execution disabled` button with `0` browser
  runtime errors (`.tools/task07lr-chat-redacted.png`). Public profile restored
  and verified (`localGeminiAvailable: false`, `localDiscoveryAvailable: false`,
  `publicLiveGemini: false`, policy POST `200`, discovery POST `403`, owner chat
  GET `403`); all owned servers stopped. Zero PayPal or database operations.

### 2026-11-05 — Task07M targeted PayPal acceptance research (offline)

Request: extend Earmark's existing Tavily + Gemini offer discovery to
investigate whether discovered merchants accept PayPal via a targeted search for
supported payment methods (prioritizing official FAQ, billing documentation and
checkout pages), extract direct evidence and the official source URL, distinguish
explicitly confirmed PayPal support from PayPal not mentioned in published
methods and insufficient evidence, avoid inferring PayPal from credit cards or
unrelated sites, show evidence/uncertainty in Norway, and never approve or bind
external merchants for Sandbox payments.

Modified files:

- `web/src/lib/offer-discovery.ts`: added `paypalSourceUrl?: string | null` to
  `DiscoveredOffer` and `targetMerchantDomain?: string`,
  `searchRequests?: 1 | 2`, `paymentSearchResultsCount?: number` to
  `OfferDiscoveryResult`.
- `web/src/server/paypal/offer-discovery.ts`: added `TAVILY_PAYMENT_MAX_RESULTS = 3`,
  `buildTargetedPayPalQuery(merchantDomain)`, `selectTargetMerchantDomain`,
  `prioritizePaymentResults`, `boundary.allowPaymentSearch` and deterministic
  `classifyPayPalEvidence`. When Search 1 identifies a merchant domain, runs a
  targeted basic Tavily search (`"${merchantDomain} supported payment methods
PayPal FAQ billing documentation checkout"`, `max_results: 3`), prioritizes
  official merchant FAQ/billing/checkout pages, and verifies model claims
  against cited official merchant domain snippets: `"claimed"` requires an
  official merchant page explicitly confirming PayPal; `"not-listed"` records
  official payment pages that publish accepted methods (such as credit cards,
  Visa, MasterCard, bank transfer) without PayPal or explicitly exclude PayPal;
  `"unknown"` is preserved when official evidence is missing or PayPal is only
  mentioned on an unrelated third-party site. External merchants remain
  `eligible: false` (`canonicalVerdict: "UNAPPROVED_MERCHANT"`).
- `web/src/components/offer-discovery.tsx`: updated Norway research cards to
  display the 3-state PayPal classification (`explicitly confirmed in official
merchant documentation`, `not mentioned in published payment methods`, or
  `insufficient evidence`), supporting evidence snippet and clickable
  `Official payment source` link (`paypalSourceUrl`).
- `web/test/offer-discovery.test.ts`: updated offline fixtures for the targeted
  payment search sequence and added offline verification covering all three
  PayPal classifications (`claimed`, `not-listed` from credit-card-only official
  FAQ even when model over-claims, `unknown` when PayPal appears on an unrelated
  third-party site, and `unknown` when evidence is insufficient) plus
  unapproved-merchant policy enforcement (`26/26` tests passing).
- `HANDOFF-PAYPAL.md`: recorded this entry and updated the current project state.

Offline checks run and results:

- `npx --workspace @flint/web vitest run offer-discovery judge-sandbox paypal-gemini-agent paypal-gemini-boundary`:
  PASS (`4/4` files, `81/81` tests, including `26/26` in
  `web/test/offer-discovery.test.ts`).
- `npm run typecheck`: PASS (`@flint/agent`, `@flint/web`, `api/src/tsconfig.json`).
- `npx biome lint web/src/lib/offer-discovery.ts web/src/server/paypal/offer-discovery.ts web/src/components/offer-discovery.tsx web/test/offer-discovery.test.ts --error-on-warnings`:
  PASS (`4` files, `0` warnings/errors).
- `npm run build --workspace @flint/web` (with `NEXT_PUBLIC_DEMO_ONLY=true`):
  PASS (`14/14` static pages and dynamic routes).
- `node scripts/check-web-boundary.mjs`: PASS (`54` compiled browser chunks, `0`
  credential or private-key matches).
- `npm run paypal:secrets:check`: PASS (`339` tracked files, `418` candidate
  files, `54` browser chunks, `0` credential matches).

Restrictions honored: zero live Tavily or Gemini calls, zero PayPal operations,
zero database reads or writes, no git staging/commit/push and no deployment.

### 2026-11-07 — Task07N unattended PayPal Sandbox purchase

Requested one saved-Wallet purchase after initial consent and a bounded Earmark
mandate. Capability review only: the existing US profile attests to seller
identity and the prior capture used standard buyer-approved checkout. The order
client never requests vaulting, so the capture does not establish a reusable
payment token or this seller's unattended-payment entitlement.

PayPal's [Wallet setup guide](https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal)
requires billing-agreement/reference-transaction approval. On the exact US Sandbox
REST app linked to the controlled Business seller, manually verify **Accept
payments → Advanced options → Vault**. Confirm Wallet/reference-transaction
eligibility with PayPal if the Dashboard does not show it. Neither capability is
recorded locally; neither is proven disabled. A merchant-scoped token belongs to
the consenting payer and the same seller; it does not authorize external sellers.

After capability confirmation, the supported path is a Vault v3 setup token,
buyer sign-in and explicit billing-agreement approval on PayPal, then server-side
exchange of the approved setup token for a merchant payment token. Bind it to the
payer, app and controlled seller and keep it out of client/model/log output. A
separate, expiring Earmark mandate must pin one offer, merchant, currency, amount
and purchase key; no renewal authority. Reuse the policy lock, durable operation
claims, request IDs and validated capture accounting for an Orders v2 payment
using the saved token. Stop on decline or unexpected payer action; reconcile
uncertain outcomes without redispatching a charge. The implementation and offline
stubs are gated on the entitlement check. Any live setup/exchange and the single
subsequent Sandbox charge need explicit authorization for their exact scope.

Only this handoff changed. No new flow or stub was implemented. Existing checkout
and Judge Sandbox baseline: 109 offline tests passed (client, service, policy,
agent payment and judge sandbox); scoped Biome lint passed on five modules.
No PayPal/Gemini/Tavily requests, financial DB operations, mandates, deployments
or Git publication. Gemini/Tavily discovery and all existing approvals are intact.
Safe-profile `@flint/web` production build (including agent compilation and Next
TypeScript) passed, generating 14 static pages. `git diff --check` passed with
only the working-copy line-ending notice.

### 2026-11-07 — Task07N-A one-shot Sandbox Wallet Vaulting capability test

Read the [PayPal setup-token reference](https://developer.paypal.com/api/payment-tokens/v3/setup-tokens-create/).
Offline preflight matched the configured Sandbox REST app and US Business
merchant against the saved human-confirmed binding. Existing server-only OAuth
returned HTTP 200. Exactly one `POST https://api-m.sandbox.paypal.com/v3/vault/setup-tokens`
with a unique request ID, merchant Wallet source and loopback callbacks returned
HTTP 201, `PAYER_ACTION_REQUIRED`, and a validated Sandbox `approve` link. Zero
retries. PASS for initiating setup only. No link opened, buyer login/consent,
billing agreement, payment-token exchange, order, capture, database operation,
or model/search call. No token, approval URL, or credentials logged or persisted.
Only this handoff changed; no application code, Git publication or deployment.
Next: separately authorize buyer consent and exchange to test token issuance;
reference-transaction entitlement and an unattended charge remain unverified.

### 2026-11-07 — Task07N-B Sandbox Wallet consent and token exchange

Local US Sandbox binding preflight passed. One fresh Wallet setup POST with an
explicit no-charge consent description returned HTTP 201, `PAYER_ACTION_REQUIRED`.
The temporary loopback page used a one-use launch ticket, session cookie, CSRF
check and callback state; unauthenticated GET and forged POST both returned 403.
The first Continue click failed locally before PayPal. Offline Chromium reproduced
the `no-referrer` policy sending a null form Origin; using `same-origin` restored
the expected Origin without sending a referrer to PayPal. The existing setup
remained available for a correction in the same browser tab; no new setup request.

Final: PARTIAL, local consent window expired and the listener exited. OAuth HTTP
200 (one request), setup HTTP 201 (one POST), zero approval reads, exchanges or
retries. No redirect to PayPal was recorded, no buyer consent or token issuance
verified, and no token/approval URL retained by the runner. Zero payments, DB
operations, Gemini/Tavily calls or Git publication. Only this handoff changed;
no application code. Before a separately authorized fresh attempt, serve the
local form with `Referrer-Policy: same-origin` and verify the button offline.
Reference transactions and unattended payments remain unverified.

### 2026-11-07 — Task07N-B-FIX loopback consent navigation

Recovered the prior inline runner into ignored `.tools/paypal-vault-consent.mjs`.
Changed `no-referrer` to `same-origin`; kept the exact-Origin check, session,
CSRF, callback state, loopback binding and Vault API flow. Added a fixture-only
mode that cannot dispatch provider calls. No Norway or application changes.

Offline Chromium passed: the form sent the loopback Origin, returned 303, and
reached the intercepted Sandbox approval path with no Referer. Cancel and
expiry stopped the flow. Invalid session, public Host, null Origin, bad CSRF
and invalid callback state were blocked. The final check used Chromium-level
interception and a blocked-egress proxy after correcting the test probes.
Node syntax, scoped Biome lint and the saved runner's local US binding preflight
passed. App typecheck/build were skipped: no app or TypeScript changed.
No live PayPal API call, setup, consent, exchange, payment, DB operation or Git
publication. The runner is ready for a fresh attempt only with new authorization.

### 2026-11-07 — Task07N-B fresh Sandbox consent attempt

Fresh authorization covered one setup and one exchange. Syntax and local US
binding preflight passed. The corrected loopback page opened the Sandbox buyer
flow; the human buyer approved on PayPal. One OAuth request returned HTTP 200;
one setup POST returned HTTP 201 / `PAYER_ACTION_REQUIRED`; one approval read
returned HTTP 200 / `APPROVED`; one exchange returned HTTP 201 and issued a
Wallet payment token. Zero retries. The runner held the token only transiently,
discarded it and exited; it logged no token or approval URL. Future tests may
require fresh consent or an authorized secure token-handling flow.

No reference transaction, order, capture, payment, DB operation, model/search
call or Git publication. Only this handoff changed. Reference-transaction
eligibility and unattended payment still require separate verification and
authorization.

### 2026-11-07 — Task07N-C prepare a single saved Wallet purchase

Added `web/src/server/paypal/saved-wallet.ts` and extended `client.ts` and
`service.ts` in that directory. The operator-only entry point requires trusted
verified consent for the expected payer, same Sandbox app/seller, exact USD
offer and owner. Requires an active dedicated mandate with one merchant and
cap/per-transaction limit equal to the price. It uses the fixed
`paypal-wallet-once-v1` key. PayPal `vault_id` remains private and is sent only
to Sandbox Orders; `MERCHANT` / `SUBSEQUENT` / `IMMEDIATE` matches the
[non-recurring prepaid Wallet agreement](https://developer.paypal.com/api/payment-tokens/v3/definitions/paypal_wallet_response/).
Reuses durable order/capture claims, request IDs, reconciliation and accounting.
No extra capture if create already reports a verified capture; refusal, payer
action and ambiguous responses stop without an automatic fallback or retry.
No browser, Judge Sandbox, Gemini, Tavily or token lookup route was added.

Added `web/test/paypal-saved-wallet.test.ts`: 9 offline tests. Targeted suite
passed 171/171 across 8 files; the Wallet file passed again with the ordinary
checkout fallback assertions. Scoped lint/format passed. Initial typecheck found
a test-only override type too narrow for a deliberate invalid-currency input;
corrected it. Web typecheck and the safe-profile production build passed
(14 static pages); the 54-chunk browser boundary scan passed with no Wallet
entry-point or guard markers present. `git diff --check` passed. No live API,
consent, order, payment or DB operation; no campaign,
deployment, staging, commit or push.

Before any live attempt: authorize a fresh same-app/seller consent and exchange
for the intended Personal buyer and exact one-off purchase, then pass the
verified token in private process memory to the local authenticated operator
flow. Do not store it in an environment/example file, DB, audit or client.
Separately approve an unexpired one-seller exact-amount USD mandate and one
order plus capture only if needed, with durable accounting and no retry. The
07N-B token is unavailable; the entry point is not wired to the consent runner.
PayPal app/seller authorization for a subsequent merchant-initiated reference
transaction and no-step-up capture remains unverified.

### 2026-11-07 — Task07N-D single $1.00 USD Sandbox Wallet purchase

Added ignored local runners `.tools/paypal-wallet-07nd.mjs` and
`.tools/paypal-wallet-07nd-checkout.mjs`; no app or route changes. Reused the
corrected loopback consent page and 07N-C service. The buyer supplies the
intended Personal account email only on loopback; it is matched to PayPal's
Wallet metadata before the dedicated $1 mandate is inserted. The token stays
in private process memory. The runner creates the non-secret, no-rerun marker
`.tools/paypal-wallet-07nd-attempted.json` before its one setup request.
Syntax checks and 28 targeted Wallet/Judge tests passed. Read-only preflight
verified the direct Sandbox database, TLS, seller/profile and historical
receipt binding, and no prior 07N-D mandate. No historical row reused or changed.

Live result: PARTIAL. Exactly four Sandbox API requests: OAuth HTTP 200,
setup HTTP 201 / `PAYER_ACTION_REQUIRED`, consent lookup HTTP 200 / `APPROVED`,
exchange HTTP 200. The exchange failed the composite distinct token ID,
Wallet shape and customer binding check (`EXCHANGE_RESPONSE_NOT_VERIFIABLE`).
The specific predicate was not recorded; HTTP 200 alone is not proof of usable
token issuance. No response body or token was retained; the runner exited.
Zero retries, mandates, orders, captures, accounting/audit writes or charges;
no receipt and no order-level payer-action or reference-transaction result.
No public restriction changes, Gemini/Tavily calls, staging or deployment.
Before a separately authorized new attempt, improve offline diagnostics to
record only which exchange predicate failed, never a value or raw response.

### 2026-11-07 — Task07N-D-FIX offline Wallet exchange diagnostics

Reviewed the [PayPal v3 response schema](https://developer.paypal.com/api/payment-tokens/v3/definitions/payment_token_response/)
and [Wallet exchange guide](https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal).
HTTP 200 and 201 are valid. The old HTTP 200 reached the composite body check;
the discarded body prevents identifying invalid/non-distinct token ID, missing
Wallet object, or customer ID mismatch as the actual failing predicate.
Vault token ID, Vault customer ID, merchant's customer key and payer ID are
separate fields; no evidence supports relaxing customer or payer binding.

Updated ignored `.tools/paypal-wallet-07nd.mjs` and added ignored
`.tools/paypal-wallet-07nd-validation.mjs`. The gate explicitly accepts only
200/201, rejects malformed supplied customer fields, and records JSON, token,
Wallet, customer comparison and payer checks as booleans or not comparable.
No response values are emitted. Fifteen offline response fixtures and both
Node syntax checks passed. No live requests, DB operations or publication;
the consumed one-shot marker was unchanged. The diagnostic runner is ready
for a separately authorized attempt, not evidence of payment eligibility.

### 2026-11-07 — Task07N-D-R one authorized Sandbox Wallet evaluation

Updated ignored `.tools/paypal-wallet-07nd.mjs` and
`.tools/paypal-wallet-07nd-checkout.mjs` to select a fresh mandate namespace
and atomically create `.tools/paypal-wallet-07nd-r-attempted.json` before the
setup request. The original consumed marker was preserved. Both Node syntax
checks and the marker ignore check passed. Read-only preflight verified the US
Sandbox app and merchant binding, the dedicated Neon Sandbox schema and
historical receipt binding, and the absence of a mandate in either namespace.

Exactly four PayPal Sandbox API requests with zero retries. OAuth returned 200,
setup returned 201 / `PAYER_ACTION_REQUIRED`, the lookup after manual buyer
consent returned 200 / `APPROVED`, and exchange returned 200. JSON, response
shape, token ID format and distinctness, Wallet shape and customer ID format
passed. `customerIdMatches` was false and the gate returned
`EXCHANGE_RESPONSE_NOT_VERIFIABLE`. `merchantCustomerIdPresent` was false
(informational) and `walletPayerIdPresent` was true. The downstream payer and
agreement checks were not reached. The process exited with no token retained
locally. No response body, customer identifiers, approval URLs or credentials
were recorded.

No mandate, order, capture, receipt or accounting/audit write. No charge,
order-level payer-action result or reference-transaction eligibility result.
Public demo restrictions were unchanged. No Gemini/Tavily, publication or
deployment. The single evaluation is consumed. Before any future authorized
attempt, establish PayPal's binding semantics for these two customer IDs and
retain a fail-closed consent, payer and merchant binding.

### 2026-11-07 — Task07N-D-ID offline Wallet customer binding review

Correction to the previous summary: `customerIdMatches: false` compared the
exchange with the **setup creation** customer ID. The approved lookup was only
compared when it returned an ID. Its presence was not recorded, so the
exchange-versus-lookup relationship cannot be reconstructed. The same setup
token and bound Sandbox OAuth app/merchant were used throughout. The expected
buyer was supplied locally and remained subject to payer/email/arrangement
checks. The prior run stopped before the final payer checks completed.

PayPal's [direct Wallet guide](https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal)
uses only the approved `SETUP_TOKEN` at exchange and shows the same Vault
customer ID in creation and exchange. The [v3 exchange schema](https://developer.paypal.com/api/payment-tokens/v3/payment-tokens-create)
accepts an optional `customer.id`. The [SDK guide](https://developer.paypal.com/sdk/js/v5/save-without-purchase/paypal/)
advises reusing an existing PayPal-generated ID already associated with a
returning payer. This runner has no trusted saved mapping for that buyer.
No required exchange field was missing. The schemas distinguish Vault customer
ID, merchant customer ID, Wallet payer ID and both token IDs. The published
example supports equality for the direct flow, with no universal guarantee
documented. Why Sandbox returned a different ID remains unknown.

Updated ignored `.tools/paypal-wallet-07nd.mjs` and
`.tools/paypal-wallet-07nd-validation.mjs` to require the approved lookup's
schema-valid customer ID before exchange, reject conflicts with the creation
ID when supplied, and require `customerIdMatches: true` against the approved
ID before checkout. Added ignored `.tools/paypal-wallet-07nd-validation.test.mjs`.
Three synthetic tests passed, covering both success statuses and missing,
malformed or conflicting IDs, including a matching merchant alias. Both
syntax checks passed after running outside the Windows filesystem sandbox
because Node's initial path lookup returned `EPERM`. Diagnostics remain flags
only. The exchange payload and payer checks were unchanged. No live requests,
consent, DB operations, payment or publication. The consumed markers were not
reused. A separately authorized evaluation needs a fresh marker and genuine
consent, with a valid, consistent approved customer and verified payer before
any mandate or payment. If PayPal returns another mismatch, stop and confirm
the merchant-scoped Vault behavior with PayPal before changing the request.

### 2026-11-07 — One live Sandbox Wallet binding diagnostic

Updated ignored `.tools/paypal-wallet-07nd.mjs` with a consent-only mode that
does not load checkout or access Neon. The loopback page and PayPal consent
description identify the no-charge diagnostic. A fresh atomic marker,
`.tools/paypal-wallet-binding-attempted.json`, prevents reruns. Node syntax,
all three offline validation tests and marker checks passed before launch.

One OAuth request (200), one setup (201 / `PAYER_ACTION_REQUIRED`), one lookup
after manual consent (200 / `APPROVED`), and one exchange (200). All three
responses supplied a valid Vault customer ID. Creation and approval matched.
Exchange returned a different ID (`customerIdMatches: false`), even though
the response included a valid distinct token ID and Wallet object. The runner
stopped before final payer verification. No credentials, tokens, customer
IDs, buyer details or response bodies were retained locally. The ignored
`.tools/paypal-wallet-binding-support.json` holds only response statuses,
timestamps and PayPal debug references for a potential support case.

Zero retries, mandates, orders, captures or database operations. No public
profile change or publication. The single diagnostic is consumed. Ask PayPal
Merchant Technical Support to explain the changed Vault customer association
for the same approved setup token before changing the binding or authorizing
another purchase test.

### 2026-11-07 — Task07N-E PayPal Vault identity review

The [Wallet guide](https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal)
documents exchanging the approved setup token for a separate payment token.
It illustrates the same Vault `customer.id` in creation and exchange. The
[v3 schema](https://developer.paypal.com/api/payment-tokens/v3/payment-tokens-create)
makes the request customer reference optional. The Wallet and
[SDK guides](https://developer.paypal.com/sdk/js/v5/save-without-purchase/paypal/)
describe reusing a PayPal-generated ID already associated with a returning
payer. Earmark has no trusted saved mapping here. A merchant customer alias
is an app-side mapping aid. The optional Wallet `payer_id` identifies the
PayPal account. Neither field explains or resolves the observed mismatch.

Reviewed the local runner and 07N-C checkout. The runner uses the same setup
ID for the provider-approved lookup and exchange with the bound Sandbox
app/merchant. Customer matching, payer/expected-email checks and setup-token
provenance precede checkout. The server-only checkout trusts its private
caller for provider evidence and independently enforces owner, merchant,
app fingerprint, expiry, exact purchase and mandate/budget policy. The
runner's expected payer comes from the same verified flow as its consent
record. The service equality check is not an independent PayPal lookup.

The latest recorded diagnostic established that creation and approved lookup
matched and exchange differed. The same request is valid and no implementation
defect causing that result was found. No supported reconciliation rule was
found, so no source or fixture changes. Two Node syntax checks, three local
identity fixtures and nine mocked checkout tests passed. The web test command
also ran the existing agent workspace pretest build. No live calls, consent,
database operations or publication. An unchanged retry has no clear diagnostic
benefit and unattended purchase eligibility remains unverified.

Ask PayPal Merchant Technical Support: In Sandbox Payment Method Tokens v3,
can a same-app, same-merchant `POST /v3/vault/payment-tokens` using only a
matching approved `SETUP_TOKEN` legitimately return a different Vault
`customer.id`? If yes, which server-verifiable fields or API lookup bind the
resulting payment token to that exact consent and payer, and when must an
already-associated `customer.id` be supplied? Provide endpoint sequence, HTTP
statuses, approval state, equality flags, UTC timestamps and PayPal debug
references from ignored `.tools/paypal-wallet-binding-support.json`. Exclude
token values, customer and payer identifiers, credentials and raw bodies.

### 2026-11-07 — Task07N-F Wallet identity binding hardening

Prior 07N-D family requests omitted `permit_multiple_payment_tokens`. The
[setup schema](https://developer.paypal.com/api/payment-tokens/v3/setup-tokens-create)
defaults it to false. The opt-in permits multiple saved tokens for one payer
and merchant/platform, including distinct merchant customer contexts for one
Wallet. This does not explain the observed mismatch under the default.

Updated ignored `.tools/paypal-wallet-07nd.mjs`,
`.tools/paypal-wallet-07nd-checkout.mjs`,
`.tools/paypal-wallet-07nd-validation.mjs` and
`.tools/paypal-wallet-07nd-validation.test.mjs`. The runner now validates the
existing local owner credentials against the preserved US profile and uses
the existing rate-limited `TestOwnerAuth` login on the one-use loopback form
before creating setup. Its existing browser cookie, Origin, CSRF and callback
state guards remain. One in-memory record binds owner, browser session,
app/merchant fingerprint, expected buyer email, setup ID and expiry before
redirect. The same record gates approval and the transition to checkout.

Setup sends the documented false explicitly. Setup and exchange both send
`customer.merchant_customer_id`, supported by the
[Wallet guide](https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal)
and [exchange schema](https://developer.paypal.com/api/payment-tokens/v3/payment-tokens-create).
The 64-character opaque value is a domain-separated HMAC of the stable local
owner identity and app/merchant binding using the existing server-side session
secret. The runner requires an exact echo at creation, approval lookup and
exchange as local policy. PayPal's lookup schema allows the field to be absent,
so a missing echo stops the test. No previously issued `customer.id` is sent.
The merchant reference does not authenticate the PayPal account.

The runner requires both PayPal responses to supply the same valid Wallet
`payer_id`. The expected email remains supplementary, and supplied conflicts
block progress. Checkout receives the exchange payer ID and the approved lookup
payer ID separately. The existing Vault customer ID comparison remains strict.
No storage migration, app route, mandate, accounting or authorization changes.

All three syntax checks, six offline identity tests, nine mocked checkout tests
and the offline loopback smoke passed. The smoke checked private access, ticket
reuse, owner login, Origin, CSRF, callback state and substituted setup ID without
following the PayPal redirect. No live requests, database access, payment or
publication. The provider mismatch remains unresolved. A useful future test
would be one separately authorized, no-charge setup/approval/exchange with a
fresh marker, recording only presence and equality flags and provider debug
references. Stop on any missing or conflicting evidence. If Vault IDs still
differ, require PayPal's documented binding rule before considering checkout.

### 2026-11-07 — Task07N-G one no-charge Sandbox identity diagnostic

Updated ignored `.tools/paypal-wallet-07nd.mjs` with a consent-only diagnostic
mode and sanitized per-stage presence, comparison and provenance flags. The
mode created `.tools/paypal-wallet-07ng-attempted.json` atomically and left
earlier markers intact. Syntax, six offline identity fixtures and marker
checks passed before launch. The existing US Sandbox app and merchant binding
passed. Local owner login preceded setup, and the user manually approved on
PayPal. Setup explicitly sent `permit_multiple_payment_tokens: false`. Setup
and exchange used the same scoped opaque merchant reference.

Four Sandbox requests, zero retries: OAuth 200, setup 201 / `PAYER_ACTION_REQUIRED`,
lookup 200 / `APPROVED`, and exchange 200. The three Vault customer IDs were
present and format-valid. Setup and lookup IDs matched. The exchanged ID
differed. The merchant reference was present and matched at setup and lookup.
It was absent at exchange, so there was no reference comparison. Both Wallet
payer IDs were present, valid and equal. Expected buyer email checks and setup
token provenance passed. Overall identity validation failed with
`EXCHANGE_RESPONSE_NOT_VERIFIABLE`. The process exited and retained no token or
private response data. Ignored `.tools/paypal-wallet-07ng-support.json` holds
only sanitized outcomes, UTC timestamps and PayPal debug references.

Zero orders, captures, charges, mandates, database access or financial writes.
No public changes, live AI calls or publication. The single diagnostic was
consumed. The customer mismatch reproduced with the merchant reference sent,
and the exchange did not echo it. Ask PayPal to explain both results using the
sanitized trace. A $1 unattended test is not justified while binding fails.

### 2026-11-07 — Task07P real-offer discovery and review proposals

- `web/src/server/paypal/agent-checkout-http.ts` and
  `web/src/components/purchasing-chat.tsx` expose online research as an explicit
  option in the existing local owner chat. It requires the existing discovery
  and network flags, both server keys, payment/backend disabled, and normal
  owner, Origin, CSRF and rate-limit checks. The chat branch does not open the
  durable checkout repository. The synthetic and public Judge paths retain
  their previous defaults and gates.
- `web/src/server/paypal/offer-discovery.ts`, `web/src/lib/offer-discovery.ts`
  and `web/src/components/offer-discovery.tsx` reuse the guarded Tavily searches,
  Gemini collector, PayPal evidence checks and independent policy engine. The
  comparison requires matching plan and explicit price/currency evidence from
  retrieved snippets, withholds conflicting prices and keeps missing facts
  unknown. It checks USD budget, requested billing and delivery constraints,
  required PayPal evidence and approved-merchant requests. Norway cards show
  retrieval time, reasons, cited external links and the lowest supported
  comparable review candidate when available. `proposal` remains null and no
  authorization, reservation or intent is created. Provider call counts per
  evaluation are unchanged.
- `web/test/offer-discovery.test.ts` adds offline coverage for conflicting,
  ambiguous and unrelated-plan quotes, comparison constraints and the owner
  chat request through mocked Tavily/Gemini. All 59 tests across discovery,
  owner chat and Judge Sandbox passed. Formatting and warning-free lint of
  the six edited files passed. Initial lint and TypeScript checks caught a
  card key and strict typing issues, which were corrected. The final public
  demo production build and standalone typecheck passed with discovery, AI
  network and payments disabled. No browser session was used for this check.

Only quoted snippet evidence is compared. Checkout price, stock, fulfillment
and PayPal support remain unverified. Pricing support is limited to explicit
currencies and recognizable billing periods. The targeted PayPal lookup covers
one merchant per request, and other merchant evidence depends on the initial
search. No live provider calls, financial operations, database changes or
publication. A separately authorized next test can submit one weather API
request with a $10/month cap and request PayPal evidence, allowing the existing
two Tavily calls and one Gemini collector call. Inspect source fidelity and
confirm external merchant rejection. Keep the payment backend disabled.

### 2026-11-07 — Task07P-L live real-offer verification

Added ignored `.tools/task07pl-run.mjs` and `.tools/task07pl-trace.mjs`, using
the prior browser/transport pattern and the existing owner login and chat
route. A temporary loopback development server isolated the public build.
Both syntax checks and Chromium/ignore checks passed. The initial readiness
timeout occurred before any dispatch or submission. Its sanitized artifacts
were archived as `.tools/task07pl-preflight1-result.json` and
`.tools/task07pl-preflight1-trace.jsonl`. A longer local readiness window passed
with the expected unauthenticated HTTP 401, then owner login and CSRF passed.

The exact requested prompt was submitted once, recorded in
`.tools/task07pl-submission.json`. The offer Tavily search returned HTTP 200
in 3,896 ms with five results. Targeted payment-method search returned HTTP
200 in 2,398 ms with three results. Both outbound envelopes passed the guard.
The app returned HTTP 409 `DISCOVERY_OUTBOUND_REJECTED` in 6,753 ms total.
Zero Gemini requests and zero retries. No extracted offers, review cards,
offer-level budget/payment-method verdicts or citations were produced. Norway
showed the error with zero browser runtime errors. Synthetic mode was present
without an evaluation. The browser checked public Judge live flags were false.
Sanitized evidence is in `.tools/task07pl-trace.jsonl`,
`.tools/task07pl-result.json` and `.tools/task07pl-chat.png`.

The trace shows result snippets ending in whitespace at the clipping boundary.
An isolated offline fixture reproduced the rejection when clipping leaves a
trailing space and the schema trims it for the expected envelope, while the
model serializes the pre-parse input. A non-whitespace control passed. This
is the strongest supported live diagnosis. The exact differing live field
was not recorded. Trim after clipping and add a boundary fixture before any
separately authorized repeat. The guard and application source were unchanged.

The temporary server and browser exited. Generated `.next/dev` output was
isolated, the generated type reference was restored when needed and the
public production build ID was preserved. Payments, the PayPal backend and
DB access were disabled. Zero PayPal requests, orders, captures, mandates,
financial writes, Git publication or deployment. The live evaluation was
consumed and was not repeated.

### 2026-11-07 — Task07P-FIX Gemini outbound request normalization

The new offline regression reproduced `DISCOVERY_OUTBOUND_REJECTED` at the
Gemini guard before the mocked transport. Clipping could leave trailing
whitespace in a title or snippet. Schema parsing trimmed the expected
envelope while Gemini previously serialized the pre-parse observations. The
exact mismatching field from the historical live request remains unknown.

Updated `web/src/server/paypal/offer-discovery.ts` to trim after clipping and
pass the canonical schema output from the guard setup into the existing Gemini
builder. Endpoint, redirect, timeout, exact headers and byte-for-byte body
checks remain enforced. The collector now distinguishes request metadata,
header and body rejections with fixed error codes and no payload logging.
Updated `web/test/offer-discovery.test.ts` with coverage for titles and both
search stages, the 600-character snippet boundary, exact envelope equality,
modified observations and unauthorized headers. Existing source restrictions,
privacy checks, synthetic paths and public Judge restrictions are unchanged.

Before the fix, the targeted boundary fixture failed as expected. After the
fix, 60 offline discovery, owner chat and Judge tests passed, with formatting
and targeted warning-free lint. Standalone typecheck and the public demo build
passed with AI and payments disabled. No live Tavily, Gemini or PayPal requests, DB
mutations or publication. Next is one separately authorized owner-chat live
retest to confirm provider extraction and Norway rendering.

### 2026-11-07 — Task07P-L2 live real-offer discovery retest

Reused ignored `.tools/task07pl-run.mjs` and `.tools/task07pl-trace.mjs`, adding
only an isolated `--07pl2` artifact namespace and fresh atomic submission
marker. Previous artifacts were preserved. Both syntax checks, ignore and
marker checks, and the focused clipping regression passed. Temporary loopback
owner login and CSRF passed with PayPal, payments and DB access disabled.

One exact prompt submission and no retries. Tavily discovery returned HTTP 200
in 3,671 ms with five results. Targeted payment search returned HTTP 200 in
626 ms with three results. Gemini returned HTTP 200 in 1,544 ms with `STOP`
and `reportDiscoveredOffers` containing two offers. The strict outbound guard
passed with minimized, sanitized observations. Norway returned HTTP 200 in
6,262 ms total and rendered both cards with zero browser runtime errors.

WeatherAPI.com (paid 3M-call tier) and MeteoSource (generic paid plan) both
rendered unknown price and billing. The cited posts mention $7/month for 3M
calls and a $5/month starting price, respectively, but do not establish an
explicit USD quote for the extracted plan labels. No price contradiction was
flagged and no under- or over-budget verdict could be made. Features,
availability and delivery were not established for the displayed plans.
Both cards were `INSUFFICIENT_EVIDENCE` and ineligible, with no review
recommendation, purchase proposal, authorization, reservation or persistence.
MeteoSource PayPal was `unknown`. WeatherAPI was labeled `not-listed` even
though the cited changelog only describes updating a billing method and does
not enumerate payment methods. It should be `unknown` on that evidence.

The browser verified safe cited links and a disabled payment control. All
three cited destinations were reachable, including the WeatherAPI blog after
its same-site trailing-slash redirect. Synthetic mode remained available and
was not exercised. Judge live access was disabled and the public build ID
was preserved. The browser and owned server exited. No PayPal requests,
orders, captures, mandates, payments, DB writes, Git publication or deployment.

Sanitized artifacts: `.tools/task07pl2-submission.json`,
`.tools/task07pl2-result.json`, `.tools/task07pl2-trace.jsonl`, and
`.tools/task07pl2-chat.png`. No app source changed. Smallest follow-up: require
an actual list of payment methods or explicit exclusion for `not-listed`,
and prefer first-party pricing pages with named tiers and explicit currency
within the same search budget. The authorized live evaluation was consumed.

### 2026-11-07 — Task07P-Q offer evidence accuracy

Updated `web/src/server/paypal/offer-discovery.ts`. A generic mention of a
payment method previously triggered `not-listed`. The classifier now uses
retrieved merchant-domain payment documents and explicit acceptance or a
complete accepted-method list. Changelogs and partial lists remain `unknown`.
Consistent results keep the relevant evidence citation. Replaying the
07P-L2 evidence offline changed WeatherAPI's PayPal verdict to `unknown`.
MeteoSource stayed `unknown`, and neither result gained a price or a review
recommendation.

The existing offer search asks for first-party named-tier pricing, and
pricing and plan pages rank ahead of editorial comparisons. The existing
payment search requests the selected merchant site. Gemini still gets the
original instruction and the canonical guarded evidence. The verifier now
requires a price clause tied to the named tier, explicit currency and a
consistent billing period. It withholds starting prices, bare dollar quotes,
mixed billing terms and quotes tied to another tier. Competing prices for the
same tier still fail closed. The two-search, one-extraction cap, privacy guard
and independent external-merchant prohibition are unchanged.

Updated `web/src/components/offer-discovery.tsx` for clearer accepted-method
list wording and `web/test/offer-discovery.test.ts` for the offline replay,
payment evidence, named-tier ordering and price ambiguity regressions. The
tests render the Norway cards to static markup. All 67 discovery, owner chat
and Judge Sandbox tests passed, as did formatting and targeted warning-free
lint. Standalone typecheck and the public demo build passed with AI,
discovery and payments disabled.

No live provider, PayPal, financial or database operations and no publication.
Brand/domain matching and the complete-sentence checks deliberately leave
some real evidence unknown. One separately authorized live owner-chat test
would measure search relevance, without requiring a recommendation. Use a
fresh marker and update the exact-query expectations in the local transport
observer for the revised queries before any such run.

### 2026-11-07 — Task07P-L3 live offer evidence verification

Updated ignored `.tools/task07pl-run.mjs` and `.tools/task07pl-trace.mjs` only
for an isolated `--07pl3` marker/artifact namespace and the revised exact
Tavily query expectations. Earlier markers were preserved. Both syntax checks,
ignore/marker checks and two focused offline evidence regressions passed,
including the WeatherAPI changelog returning `unknown`. Owner authentication
and CSRF passed on the temporary loopback server before the single submission.

The offer Tavily search returned HTTP 200 in 4,458 ms with five results,
including WeatherAPI's official pricing page and AccuWeather's plan table.
The merchant-site payment search targeted WeatherAPI and returned HTTP 200
in 1,479 ms, with one result passed to the collector. Gemini returned HTTP
200 in 1,353 ms with `STOP` and one `reportDiscoveredOffers` entry. All three
envelopes passed the strict guard and sanitized checks. Norway returned HTTP
200 in 7,754 ms total. There were zero retries or additional evaluations.

The browser rendered AccuWeather Starter with an accessible cited developer
overview, retrieval time, `INSUFFICIENT_EVIDENCE`, PayPal `unknown` and no
verified price, currency or billing period. The cited table shows $2/month,
15,000 monthly calls and forecast features, but the dollar currency is
unspecified in that evidence. No contradictory price was detected. No budget
match, review recommendation or checkout eligibility was granted. The payment
search targeted WeatherAPI before extraction, so it did not establish
AccuWeather's payment methods. No WeatherAPI card was extracted in this run.

Browser inspection found a remaining defect. Starter displayed `available
(reported)`, although the captured table's availability wording is `Not
available` in the Free tier's overage column. The flattened snippet permits a
substring match across rows. The smallest follow-up is to bind evidence to
the exact table row or suppress ambiguous availability claims. No app source
changed in this verification.

The one card rendered without browser runtime errors. The source link matched
the evidence and opened the intended public document. Payment control stayed
disabled, Judge live access stayed restricted, and the synthetic option was
present without another evaluation. The public build ID was preserved and
the owned browser/server exited. Zero PayPal requests, orders, captures,
payments, mandates, DB access or writes, Git publication or deployment.
Ignored artifacts: `.tools/task07pl3-submission.json`,
`.tools/task07pl3-result.json`, `.tools/task07pl3-trace.jsonl`, and
`.tools/task07pl3-chat.png`. The authorized evaluation was consumed.

### 2026-11-07 — Task07P-R tier-specific evidence correction (offline)

Request: fix the unsupported `available (reported)` label observed on
AccuWeather Starter in Task 07P-L3, enforce strict tier-and-field matching when
tables or snippets flatten or lose row/column context, inspect and correct
merchant-specific payment-method search sequencing within the existing
2-Tavily / 1-Gemini budget, and verify offline without live calls.

Modified files:

- `web/src/server/paypal/offer-discovery.ts`: added `parseTierTable`,
  `hasLostProseTableContext`, `priceCandidateLines`, `verifyAvailabilityClaim`,
  `verifyDeliveryClaim`, `verifySlaClaim` and `offerMerchantDomain`; updated
  `createDiscoveryBoundary` (`allowCollector` -> `allowPaymentSearch` ->
  `allowPaymentResults`), `selectTargetMerchantDomain`, `classifyPayPalEvidence`
  and `discoverOffers`.
  - Root cause & fix: `sanitizeText` collapsed table newlines into spaces and
    `evidenceLines` split only on `[.!?]`, merging AccuWeather's `Free` (`CPM
Overage: Not available`), `Starter` and `Standard` rows into one string
    where `containsPhrase(line, "available")` matched inside `Not available`.
    Pipe tables now require an intact header row, tier column and matching
    per-row cell count; `CPM Overage` and non-availability columns are excluded;
    broken/headerless/pipe-stripped tables yield `unknown`; and prose claims
    require an explicit tier-subject availability/delivery/SLA predicate with
    matching polarity (rejecting bare `"available"` and cross-tier clauses).
  - Payment-method search sequence: reordered to `Tavily offer search -> Gemini
collector -> Tavily targeted merchant payment-method search` (still capped
    at 2 Tavily requests + 1 Gemini call, byte-for-byte guarded before `fetch`
    and validated on inbound payment snippets). Payment search now targets the
    merchant domain actually extracted by Gemini (`accuweather.com` in the
    07P-L3 replay instead of `weatherapi.com`), and payment URLs/evidence are
    never cited or reused across different merchants.
- `web/test/offer-discovery.test.ts`: updated offline transport and boundary
  ordering for the new 3-step sequence and added focused regressions reproducing
  the Task 07P-L3 AccuWeather Free/Starter table, `Free` `CPM Overage` cell,
  cross-tier table/prose claims, lost row/column context, explicit merchant
  availability rendering, and cross-merchant payment evidence isolation.
- `HANDOFF-PAYPAL.md`: recorded this entry and updated the current project state.

Offline checks run and results:

- `npx --workspace @flint/web vitest run offer-discovery paypal-agent-chat judge-sandbox paypal-gemini-agent paypal-gemini-boundary`:
  PASS (`5/5` files, `106/106` tests, including `40/40` in
  `web/test/offer-discovery.test.ts`).
- `npx prettier --check` & `npx biome lint ... --error-on-warnings` (`4` files):
  PASS (`0` warnings/errors).
- `npm run typecheck`: PASS (`@flint/agent`, `@flint/web`, `api/src/tsconfig.json`).
- `npm run build --workspace @flint/web` (public demo flags, AI/discovery/payments
  disabled): PASS (`14/14` static pages and dynamic routes).
- `node scripts/check-web-boundary.mjs` & `npm run paypal:secrets:check`: PASS
  (`54` browser chunks, `339` tracked / `420` candidate files, `0` matches).

Limitations & next steps: zero live Tavily/Gemini calls, PayPal operations, DB
changes or Git/deployment actions. Snippet clipping (600 chars), bare `$`
symbols without ISO currency codes, and the single targeted payment search when
multiple merchants are extracted still intentionally fail closed as `unknown`.
If another live owner-chat discovery trace is separately authorized later,
update ignored `.tools/task07pl-trace.mjs` for the `offers -> gemini -> payment`
step order; discovery evidence gates are ready for assisted human-approved
checkout planning while external merchants remain unbound in Sandbox.

### 2026-11-07 — Task07P-S real-offer assisted checkout (offline)

Request: add a minimal, safe assisted-checkout experience to the authenticated
Norway chat for real merchant offers so the user can review verified vs unknown
terms, open a provenance-verified official merchant page in a new tab, and
choose `"Approve for manual checkout"` or `"Reject"` without autonomous payment,
merchant approval, credential collection or financial mutations.

Modified files:

- `web/src/lib/offer-discovery.ts`: added `ManualCheckoutDecision`,
  `safeExternalOfferUrl` (public HTTPS only; rejects non-HTTPS schemes,
  credentials, ports, hashes, IP/loopback/internal hosts, sensitive query keys
  and open-redirect query parameters/embedded URLs) and
  `selectVerifiedOfferSourceUrl` (selects only `cited: true` merchant sources,
  preferring verified `pricing.sourceUrl` or the cited plan page over a payment
  FAQ, never inventing `/checkout` URLs).
- `web/src/server/paypal/offer-discovery.ts`: delegated `discoverySource` to
  `safeExternalOfferUrl` plus `node:net` `isIP` so server ingestion and client
  rendering share one URL/redirect safety check.
- `web/src/components/offer-discovery.tsx`: added optional `assistedCheckout`
  (default `false`) and inline per-offer assisted-checkout review in session
  memory only. Displays merchant, snippet price/currency/billing period,
  canonical unapproved-merchant restrictions, explicit unresolved/unknown
  evidence, merchant-site confirmation and no-credential notices, a verified
  `target="_blank"` `rel="noopener noreferrer"` `referrerPolicy="no-referrer"`
  merchant link (withheld with approval disabled when no safe cited URL exists),
  and `"Approve for manual checkout"` / `"Reject"` controls that record local
  session intent (`not paid · external purchase unverified`, never `PAID` or
  `COMPLETED`) and direct the user back to the merchant site for manual
  registration and checkout.
- `web/src/components/purchasing-chat.tsx`: passed
  `assistedCheckout={!judgeSandbox && Boolean(csrf)}` to `OfferDiscovery`,
  preserving synthetic offer flows and all public Judge Sandbox behavior.
- `web/src/app/norway.css`: added compact responsive Norway styling
  (`.norway-assisted-bar`, `.norway-assisted-actions`,
  `.norway-assisted-checkout`, `.norway-assisted-status`).
- `web/test/offer-discovery.test.ts`: added offline unit and static-markup
  coverage for redirect/scheme/provenance link checks, Judge Sandbox omission,
  Approve/Reject states, AccuWeather unknown-evidence preservation, withheld
  unsafe/uncited links disabling approval, and zero `PayPalPaymentService` /
  mandate calls.
- `HANDOFF-PAYPAL.md`: recorded this entry and updated the current project state.

Offline checks run and results:

- `npx --workspace @flint/web vitest run offer-discovery paypal-agent-chat judge-sandbox paypal-gemini-agent paypal-gemini-boundary`:
  PASS (`5/5` files, `108/108` tests, including `42/42` in
  `web/test/offer-discovery.test.ts`).
- `npx prettier --check` & `npx biome lint ... --error-on-warnings` (`6` files):
  PASS (`0` warnings/errors).
- `npm run typecheck`: PASS (`@flint/agent`, `@flint/web`, `api/src/tsconfig.json`).
- `npm run build --workspace @flint/web` (public demo flags, AI/discovery/payments
  disabled), `node scripts/check-web-boundary.mjs`, & `npm run paypal:secrets:check`:
  PASS (`14/14` pages, `54` browser chunks, `339` tracked / `420` candidate
  files, `0` matches).
- Offline Chromium Playwright checks:
  - Authenticated Norway owner chat (`NEXT_PUBLIC_DEMO_ONLY=false`, all external
    traffic aborted, offline discovery fixture): PASS (`3` cards, verified
    new-tab target `https://example.com/weather/pricing`, Approve & Reject
    session updates, AccuWeather unknowns preserved, unsafe/uncited link
    withheld with approval disabled, `0` POST/mutation requests after discovery,
    `0` overflow at `1440px` & `390px`, `0` page errors).
  - Built public demo (`next start`, `NEXT_PUBLIC_DEMO_ONLY=true`): PASS
    (owner chat blocked HTTP `403`, deterministic Judge Sandbox `$4.00`
    synthetic proposal intact, Judge Sandbox discovery omits assisted-checkout
    buttons, `0` page errors). Note: `scripts/preview-smoke.mjs` passed lines
    1–569 (layout, deterministic policy, synthetic Gemini) and stopped at
    pre-existing line 570 expecting `"Send to Gemini"` where Task 07P renamed
    the discovery submit button to `"Research offers"`.

Limitations & next steps: manual checkout intent is ephemeral browser-session
state only; Earmark cannot verify whether an external purchase was completed on
the merchant's site, and PayPal saved-Wallet unattended binding remains
unresolved. Zero live Tavily/Gemini/PayPal calls, DB writes, Git commits or
deployments were performed. Smallest useful subsequent browser test: one
separately authorized local owner-chat live discovery run (after updating
ignored `.tools/task07pl-trace.mjs` for `offers -> gemini -> payment` order)
exercising `"Review for manual checkout"` and opening the cited official
merchant pricing page in a new tab with payments/backend disabled.

### 2026-11-08 — Task 07P-SMOKE complete public preview verification

Updated `scripts/preview-smoke.mjs` only. Discovery submits with `Research
offers`. Synthetic chat still uses `Send to Gemini`. After the selector
correction, the first run reached the discovery render and failed because
the browser-only mock lacked the current pricing fields. Updated that mock's
offer identity, pricing, review fit and recommendation. The public Judge card
check confirms no manual checkout entry button and a disabled payment control.

Node syntax and the complete local Chromium smoke passed (exit 0). Verified
nine production routes, Norway and Classic Light persistence/migration,
five layout widths with no overflow, three deterministic Judge requests and
an SLA rejection, four recorded and four PayPal policy scenarios, mocked
Gemini/discovery states, sandboxed search suggestions, and hosted discovery,
Gemini and owner endpoint denials. Zero browser exceptions. No production
UI edits, live provider requests, payments, database changes or publication.

Refreshed ignored screenshots in `.tools/`: `norway-{mandates,mandates-new,
payments,activity,agent-checkout,paypal-test}-desktop.png`, `norway-{mandates,
payments,activity,agent-checkout}-mobile.png`, `paypal-norway-{1440,1280,1024,
390,375}.png`, `task07i-judge-{desktop,mobile}.png`,
`task07j-discovery-{desktop,mobile}.png`, `norway-injection-desktop.png`,
`paypal-preview-{desktop,mobile}.png`, `paypal-norway-conversation.png`,
`paypal-norway-conversation-mobile.png`, and `paypal-classic-{desktop,mobile}.png`.

### 2026-11-08 — Task 07P-T live assisted-checkout verification

Updated the ignored local `.tools/task07pl-run.mjs` and
`.tools/task07pl-trace.mjs` for the Task 07P-R provider order, a fresh one-use
submission marker, hydrated owner-chat readiness and bounded browser checks.
Four offline preflight starts stopped at local server, Chromium navigation or
chat readiness. Their sanitized records are in
`.tools/task07pt-preflight{1,2,3,4}-{result.json,trace.jsonl}`. None submitted
chat or contacted either provider. Both local scripts passed `node --check`.

The final Chromium run passed owner login (HTTP 200), CSRF, private-chat
readiness and public Judge live-access checks. It submitted the exact authorized
weather API prompt once. Tavily offer search returned HTTP 200 in 4,725 ms.
Gemini extraction returned HTTP 200 in 1,448 ms with finish reason `STOP`, the
expected `reportDiscoveredOffers` tool and one reported offer. The application
returned HTTP 409 `INVALID_MODEL_RESPONSE` after 6,856 ms. The trace does not
identify the exact response validation failure. The second Tavily search was
never dispatched. No offer card, assisted review, merchant visit, approval or
rejection was reached, and the evaluation was not retried.

Both outbound envelopes passed verification and the local secret-value scan.
Chromium reported zero runtime exceptions and zero unexpected mutation
requests. There were zero PayPal requests, financial operations or financial
DB writes. Public Judge live access stayed disabled, and the public production
build was preserved. No production code or deployment changes were made.
Ignored evidence: `.tools/task07pt-submission.json`,
`.tools/task07pt-result.json`, `.tools/task07pt-trace.jsonl` and
`.tools/task07pt-chat.png`. The smallest next step is to surface the existing
sanitized Gemini response-validation category and verify it with offline
fixtures before seeking separate authorization for another live evaluation.

### 2026-11-08 — Task 07P-T-FIX offline Gemini validation diagnostics

The 07P-T trace retained the first candidate's `STOP`, first native
`reportDiscoveredOffers` call and one reported offer. It did not retain the
Gemini arguments or full envelope. The exact live validation category and field
are therefore unknown. The failure is localized to the bounded Gemini body
reader or the native response parser in `agent/src/gemini-body.ts` and
`agent/src/gemini-response.ts`. `GeminiModel.decide()` validates the declared
tool against the strict report schema before `discoverOffers()` can start the
merchant payment-method search. Downstream source provenance, cross-merchant
evidence checks and policy evaluation do not produce this parser error.

The parser distinguishes oversized or malformed responses, invalid envelopes,
safety blocks, truncated output, invalid finish reasons, missing, malformed,
multiple or undeclared calls, invalid tool arguments, and invalid finish JSON
or schema. Under the reported `STOP` and expected tool, strict argument failure,
additional calls, and an invalid full envelope remain plausible. The strict
tool schema checks required and nullable fields, price string format, currency
and PayPal enums, SLA bounds, URL string bounds, and unknown keys. Evidence
linkage, billing interpretation and source provenance are separate checks.

- `web/src/server/paypal/agent-checkout-http.ts` emits only `validationStage`
  and `validationCategory` through the server-side
  `earmark.discovery.validation` channel after authenticated, CSRF-validated
  owner discovery fails. It requires the private discovery profile and
  `EARMARK_DISCOVERY_VALIDATION_TRACE=true`. Parser categories are forwarded
  from the existing `GeminiResponseError`. A bounded body-read rejection emits
  `RESPONSE_BODY_REJECTED`. The HTTP error contract remains unchanged.
- `web/test/offer-discovery.test.ts` verifies that an offline single reported
  offer with numeric `priceMinor` returns the same HTTP 409 and traces
  `INVALID_TOOL_ARGUMENTS`. A second native call also returns the same HTTP
  error and traces `MULTIPLE_TOOL_CALLS`. Neither fixture is the original
  response. A valid neighboring offer completes, opt-out emits nothing, the
  event has exactly two fields, and hosted Judge discovery remains denied.
  The fixture checks that the handler sends no payload to console logs and
  opens no checkout service.
- Ignored `.tools/task07pl-run.mjs` opts the assisted runner into the trace.
  Ignored `.tools/task07pl-trace.mjs` records the two values only, alongside
  fixed event labels. Original evidence and consumed markers were preserved.

No defect in accepted response handling was proven, so validation was left
fail-closed and the change is diagnostic only. Nine focused suites passed
193 tests. Targeted Biome and Prettier checks and both ignored scripts' syntax
checks passed. Agent and web TypeScript checks and the public-demo production
build passed. The browser-boundary scan passed for 54 chunks, and the private
channel name and opt-in flag are absent from those bundles. The configured-secret
scan found zero matches across 339 tracked files, 420 publication candidates
and 54 browser chunks. `git diff --check` and whitespace checks for the untracked
and ignored files passed. No live provider, merchant or PayPal requests,
financial operations, database writes, commits, pushes or deployments occurred. One
future live evaluation is technically useful to capture the exact rejection
category if it recurs. It requires separate authorization and a fresh marker.

### 2026-11-08 — Task 07P-T2 live assisted-checkout retry

Updated only the ignored `.tools/task07pl-run.mjs` and
`.tools/task07pl-trace.mjs` for a fresh `--07pt2` marker, metadata-only
retention, the existing private validation trace, and a deterministic Judge
preflight. Both scripts passed syntax checks. No production code changed.
The previous consumed marker and the public production build were preserved.

One owner login returned HTTP 200 and owner/CSRF preflight passed. The Judge
endpoint denied live Gemini with HTTP 403 and returned a successful
deterministic policy evaluation. The exact existing Norway discovery scenario
was submitted once. Tavily offer search returned HTTP 200 in 6,181 ms to
headers, Gemini extraction returned HTTP 200 in 4,437 ms, and targeted Tavily
payment-method search returned HTTP 200 in 9,851 ms. All three outbound
envelopes passed the observer checks. The chat returned HTTP 200 in 24,949 ms
and rendered one policy-evaluated offer card. No validation rejection event
was emitted, and no provider request was retried.

Chromium verified the merchant and plan in the review panel, unresolved
details, policy restrictions, and disabled payment execution. It opened
`https://weatherstack.com/pricing` in a new tab with one read-only HTTPS
document request, no credentials or referrer, and HTTP 200. The review
persisted when returning to Norway. Manual approval showed `not paid` and
issued zero HTTP mutation requests and zero extra provider calls. There were
zero browser exceptions, PayPal requests, mandates, reservations, orders,
captures, payments or accounting writes. The test profile had no database
connection and blocked unrelated outbound requests.

Ignored artifacts are `.tools/task07pt2-submission.json`,
`.tools/task07pt2-result.json`, and `.tools/task07pt2-trace.jsonl`. An offline
scan of the three artifacts found zero matches against ten configured secret
or private identifier values and zero forbidden payload fields. No raw
responses, prompts or screenshots were retained. No deployment or Git push
occurred. The live assisted-checkout verification passed, so another live run
is unnecessary for this task. The earlier 07P-T rejection remains undetermined.

### 2026-11-08 — Task 08A demo readiness and UX polish

- `web/src/components/gemini-console.tsx` now labels the local $10 evaluation
  ceiling and $6 synthetic purchase cap separately from recorded Sandbox
  accounting. The public Judge view still shows the disposable synthetic
  budget, and the completed receipt stays historical. The private privacy
  panel distinguishes synthetic catalog data from public merchant sources.
- `web/src/components/purchasing-chat.tsx` names the controlled synthetic
  and live real-merchant modes, offers editable examples with no automatic
  submission, shows a 20–30 second research wait message, and translates
  failures into concise messages. The wait describes the work without
  assigning unobserved progress stages.
- `web/src/components/offer-discovery.tsx` and `web/src/app/norway.css` put
  merchant, plan, evidence-qualified price, billing period and eligibility
  near the top of each card. Source links use compact host labels in an
  expandable section. Unknown facts, policy reasons and evidence distinctions
  remain explicit. The manual review explains the official-site check, return
  to Norway and session-only approval. The status remains `not paid`.
- `web/test/offer-discovery.test.ts` checks the revised offer and safety
  presentation. `scripts/preview-smoke.mjs` extends the public fixture checks
  for the editable example, pending controls, long citation URL and safe
  errors. Ignored `.tools/task08a-owner-smoke.mjs` covers the owner UI with
  an intercepted session, discovery result and merchant page fixture.

Demo paths: in the public Judge Sandbox, use the weather request example,
compare synthetic offers and show the policy verdict, disposable budget and
approval requirement. Show recorded Sandbox accounting separately for the
completed-payment example. In the authorized local Norway profile, select
Live research, review the real-offer evidence and independent restrictions,
open the official cited site, return and approve the manual intent. The user
would complete any genuine checkout directly on the merchant site.

Nine focused suites passed 193 tests. Two first-run assertions expected the
old merchant/plan and price markup. They were updated to verify the new
display without changing the underlying evidence expectations. Agent and web
typecheck, targeted formatting, repository lint with zero warnings, the
public-demo production build, the 54-chunk browser boundary scan, and the
secret scan with zero matches passed. `git diff --check` and whitespace checks
on the untracked UI and fixture files passed.

Public Chromium smoke passed for nine routes, deterministic Judge evaluation,
live/owner endpoint denials, payment controls, and mocked research loading,
safe errors and expandable citations. The private Norway fixture passed at
1440, 1280, 768 and 375 px with no horizontal overflow or runtime exceptions.
It opened an intercepted merchant page and confirmed session-only approval
stayed `not paid`, with one fixture discovery submission and zero subsequent
mutations. Its first run timed out during development hydration. The browser
runner's readiness wait was corrected and the check passed on rerun.
Public smoke refreshed the existing ignored `.tools` screenshot groups listed
in Task 07P-SMOKE, including `task07j-discovery-{desktop,mobile}.png`.

No live provider, merchant or financial
requests, financial mutations, deployments or pushes were performed. PayPal
Vault customer binding remains unresolved and autonomous saved-Wallet payment
stays disabled. No backend, policy, payment or validation code changed.

### 2026-11-10 — Task 08B deployment readiness audit

Vercel can host the Next.js website and same-origin Node.js API routes as one
app. The root npm workspace compiles `@flint/agent` from the web prebuild.
No Neon, legacy Render worker or provider account is required for the public
demo. The existing Render blueprint is an alternate legacy preview and lacks
the public-demo flags. The local Norway owner-chat profile requires approved
Gemini/Tavily keys and protected owner/Sandbox binding, but no database URL or
PayPal secret. The separate durable launcher does require a database preflight
and is outside this demo. The live owner profile remains unsupported on Vercel.

For both public Preview and Production, set `NEXT_PUBLIC_DEMO_ONLY=true` and
`EARMARK_PUBLIC_DEMO_ONLY=true`. Explicitly set `AI_ENABLE_NETWORK`,
`EARMARK_GEMINI_ENABLED`, `EARMARK_OFFER_DISCOVERY_ENABLED`,
`EARMARK_JUDGE_LOCAL_GEMINI`, `PAYPAL_BACKEND_ENABLED`, `PAYPAL_PAYMENTS_ENABLED`,
`PAYPAL_AGENT_CHECKOUT_ENABLED`, `PAYPAL_TEST_CHECKOUT_ENABLED`, and
`EARMARK_ENABLE_TESTNET_EXECUTION` to `false`. Keep diagnostic trace opt-in off,
all provider/database/owner credentials and one-shot permissions unset, and
use `mock` for optional legacy model selectors. For the existing private
profile only, both demo flags are `false` and agent checkout, Gemini, discovery
and AI network are `true`. Judge live access and all payment/legacy execution
flags stay off. Keep the exact `http://127.0.0.1:3032` origin. The full matrix,
consumers, statuses and operator steps are in
[docs/task-08b-deployment-readiness.md](docs/task-08b-deployment-readiness.md).

The expanded browser scan found a literal private local-auth path in two
browser chunks. It did not find credentials or the file contents. Replaced
that wording with a generic reference to the protected local owner-auth file
in `web/src/components/agent-checkout.tsx` and
`web/src/components/paypal-test.tsx`. Extended `scripts/check-web-boundary.mjs`
to reject local artifact paths and verified it fails on the previous build.
No product behavior, authentication, financial logic or provider guards changed.

Manual release order: (1) Verify the Vercel project's Git link, production
branch, preview/production triggers and settings before any push. (2) Set the
public flags and verify Next.js preset, `web` root, Node 22.x, outside-root
source inclusion, lockfile and workspace-aware install. The root verification
command is `npm run build --workspace @flint/web`; Vercel runs `npm run build`
from `web` with Next-managed output. (3) Review the intended source for Git,
including required untracked application sources and `.vercelignore`. Keep
`.tools`, local credentials, state and deployment linkage private. Obtain
separate publication and deployment authorization. (4) Create a Preview from
the reviewed commit using Vercel, smoke it, then use the approved production
promotion path. Configure the final HTTPS domain and optional canonical
`FLINT_WEB_ORIGIN=https://<final-host>`. No public CORS, PayPal callback/webhook,
or provider registration is needed. (5) Confirm deterministic Judge, labeled
historical evidence, blocked live/owner/payment routes, absent assisted checkout
in Judge and disabled payment. (6) For private research failure, stop that
runner or turn off discovery/network and restart. For a public regression,
restore a known read-only deployment and repeat the smoke checks.

Verification: 225 focused tests across 12 suites, repository zero-warning
lint, agent/web TypeScript, targeted formatting, credential-blank public
production build and nine-route Chromium smoke passed. The existing handoff
has pre-existing Prettier warnings and was preserved without a global rewrite.
The separate credential-blank runtime passed 35 route checks. The 54-chunk
browser boundary and configured-secret scans passed, and the expanded checks
found no private paths, trace markers or provider endpoints in 56 browser
assets and no private artifact references in 26 Next route traces.
`git diff --check` passed. The public smoke refreshed the ignored screenshots
listed in Task 07P-SMOKE. The Vercel dashboard, remote branch linkage and
actual public hostname remain unverified.

Autonomous saved-PayPal-Wallet payment remains unresolved and disabled. No
live provider or merchant calls, database or payment activity, remote dashboard
changes, Git publication, deployment or push occurred.

### 2026-11-10 — Task 08C Monad deployment isolation

Inventory: the shared layout mounted the workspace provider and injected
wallet discovery, the navigation exposed wallet/network controls, and Classic
Light and Policies could render the recorded Monad rail. Mandates, Purchases,
Activity, escrow resolution and execution details included legacy actions or
contract copy. `web/src/lib/network.ts`, `local-chain.ts`, `wallet.ts`,
`payment-resolution.ts`, and `deployments/monad-testnet.json` carry the legacy
chain/RPC/address configuration. The workspace API and Render proxy lead to
the optional legacy worker. The web production build does not invoke Foundry.

- `web/src/app/layout.tsx`, `page.tsx`, `activity/page.tsx`,
  `mandates/page.tsx`, `payments/page.tsx`, `security/page.tsx`, and
  `web/src/components/public-paypal-pages.tsx` select PayPal navigation,
  deterministic policy, Judge and historical receipts on the public build.
  `web/src/components/navigation.tsx` shares the Norway navigation icons with
  the public shell. `web/src/components/recorded-paypal-card.tsx` and
  `web/src/app/norway.css` keep public receipts and Judge available in both
  themes without rendering legacy balances or wallet controls.
- `web/src/components/paypal-agent-console.tsx` is the existing PayPal console
  extracted from `web/src/components/gemini-console.tsx`. Its wrapper avoids
  legacy workspace state in public mode. The legacy wrapper retains its
  private Gemini preparation view. Policies shows the four existing PayPal
  scenarios. The delivery explanation still states the actual safeguards and
  limits without pointing visitors to the retired public escrow demonstration.
- `web/src/app/mandates/new/page.tsx`, `resolve/page.tsx` and
  `executions/[id]/page.tsx` gate direct legacy pages. Public guards in
  `web/src/app/api/workspace/route.ts`, `api/workspace/[action]/route.ts` and
  `api/security-demos/route.ts` respond before loading legacy services.
- The first conditional-import build still emitted dormant legacy browser
  chunks. `web/next.config.ts` now replaces
  `web/src/components/legacy-web-profile.ts` with
  `web/src/components/disabled-legacy-web-profile.ts` during public compilation,
  before Next.js collects the client graph. This preserves the original legacy
  code for non-public builds. `scripts/check-web-boundary.mjs` checks public
  chunks for legacy RPC, wallet protocol and UI markers.
- `scripts/preview-smoke.mjs` exercises the PayPal routes and legacy denials in
  Norway and Classic Light. It observes browser requests and injected wallet
  probes while blocking external traffic. The four PayPal scenarios replace
  the previous public recorded-Monad checks. The deployment inventory and
  checklist are updated in `docs/task-08b-deployment-readiness.md`.

Vercel Preview and Production use `NEXT_PUBLIC_DEMO_ONLY=true`,
`EARMARK_PUBLIC_DEMO_ONLY=true`, and `EARMARK_ENABLE_TESTNET_EXECUTION=false`
along with Task 08B's provider/payment disable settings. Omit every Monad RPC,
chain ID, vault/token address or code hash, signer key, and hosted worker or
legacy state setting listed in the matrix. The shared npm agent package and
server digest utilities remain available. No Monad service, live provider,
financial operation, Git push or deployment was used. Autonomous saved-Wallet
PayPal payments remain unresolved and disabled.

Verification: 321 focused tests across 17 suites passed, including 96 legacy
workspace, recording and payment resolver tests. The final production build
passed with chain and provider values blanked and external fetch blocked.
Chromium verified seven public pages and three direct legacy `404` responses,
both themes, the four PayPal scenarios, Judge, historical receipt and disabled
payments, plus narrow/mobile and desktop layouts. It observed zero external
requests, workspace or local-evidence API calls, injected wallet probes or
runtime exceptions. The 46 browser chunks had zero legacy marker or pinned
address matches, and none of the 26 client reference manifests referenced the
legacy client graph. Secret scanning had zero matches across 339 tracked
files, 425 publication candidates and 46 chunks. Zero-warning lint, agent/web
typecheck, targeted formatting and `git diff --check` passed. The smoke
refreshed its existing ignored screenshots under `.tools` for the seven
public routes and both themes. No remote Vercel settings were changed or
verified. Preview can be created after the Task 08B manual publication checks
and separate authorization.

### 2026-11-10 — Task 08D final publication review

Added `docs/task-08d-publication-review.md` with the exact proposed 138-file
delta against the cached `origin/main` ref. This includes 62 tracked changes
and 76 untracked files, including the inventory itself. Excluded 11 local
untracked diagnostics. The three proposed maintained CLI sources support
existing npm commands and do not ship their local inputs or output artifacts.
`.gitignore` and `.vercelignore` exclude local env, owner/buyer state, `.tools`
traces, screenshots, observers, debug output and deployment linkage. Existing
historical documentation screenshots were outside the delta and preserved.
No files were staged. Local `main` remains at checkpoint `35133d5`, one commit
ahead of the cached origin tracking ref.

The local link names `earmark-paypal`, but does not store dashboard settings.
Browser access and native window inventory timed out. The project REST lookup
using the existing Vercel CLI session returned HTTP 403. Remote Git binding,
production branch, framework/root/Node and build settings, automatic Preview
behavior, and the effective Preview flags and credentials were not verified.
No remote settings were changed. Do not push on the basis of the local link.

The release-critical local check rebuilt the public demo with provider,
database and Monad values blanked and external fetch blocked. The build,
46-chunk browser boundary scan, zero-warning lint, agent and web typechecks,
and `git diff --check` passed. The configured-secret scan found zero matches.
An expanded history/working-tree scan resolved dotenv aliases and compared
10 configured values against 48 changed checkpoint blobs and all 138 proposed
paths. It found zero matches. The preliminary scan matched a documented
variable alias in README and the handoff. It was a symbolic reference, with no
database URL or credential present. The source formatting check flagged
`web/src/server/paypal/judge-http.ts`. No application source was changed,
and the 321 Task 08C tests were reused. No remote smoke was possible.

No release commit, branch push, Preview, hostname, deployed SHA or Production
promotion was created. To resume, verify the project and Preview settings with
working read access and clear the formatter warning. Use one confirmed
non-production branch and one Preview, then smoke that deployment before
considering promotion. The local public build still isolates Monad and keeps
autonomous saved-Wallet PayPal payments disabled. No live PayPal, Gemini,
Tavily, Monad or financial requests were made.

### 2026-11-10 — Task 08D-R PayPal release branch

Prettier corrected one indentation line in `web/src/server/paypal/judge-http.ts`.
The before-and-after comparison showed only whitespace changes. Reused the
321 passing Task 08C tests because runtime behavior did not change.

The reviewed publication set remains 138 paths relative to `origin/main`,
with 11 local diagnostics excluded as listed in
`docs/task-08d-publication-review.md`. Local evidence was preserved. Prettier,
zero-warning lint, agent and web typechecks, Git whitespace checks, and the
configured-secret scan passed. The resolved credential scan found no matches
in the 138 proposed files or the 48 changed blobs in the existing checkpoint.
The public-demo production build and 46-chunk browser boundary scan passed
with provider, database and Monad values blanked in the build process.

The GitHub remote reported `main` as its default branch at the cached
`origin/main` revision. The requested `paypal-hackathon-release` branch did
not exist locally or remotely during preflight. Task 08D-R authorizes one
Git-only release commit and push on that branch. Vercel remains a separate
manual step for the operator. The public profile keeps Monad isolated and
autonomous saved-Wallet PayPal payments disabled.

Staged 102 changes on `paypal-hackathon-release`. The index delta against
`origin/main` matched the exact 138-path publication inventory. The staged
secret scan found zero credential or prohibited artifact matches. The
`git diff --cached --check` gate then failed on trailing whitespace on lines
3 and 4 of `docs/task-04-gemini-integration-report.md`. This file was untracked
during the earlier working-tree whitespace check. Stopped at this failure as
instructed. The release branch remains at the existing `35133d5` checkpoint,
with the reviewed changes staged. This outcome entry remains unstaged. No
release commit or push was attempted. Vercel was not invoked and no Preview
or Production action occurred. No live provider or financial calls were made.

### 2026-11-10 — Task 08D-R2 release commit and push attempt

Removed only two trailing spaces on each of lines 3 and 4 of
`docs/task-04-gemini-integration-report.md`. The diff ignoring end-of-line
whitespace was empty. Restaged only that file. The staged whitespace checks
passed against HEAD and `origin/main`. The 102 staged changes matched the
reviewed 138-path release delta, and all 11 local diagnostics remained
excluded. The staged scan found zero configured credential matches or
prohibited artifact paths. Prior application build and test results were reused.

Created `a29e5acd3c6b50c5c66274b6020cd2d791563877` on
`paypal-hackathon-release` with message `chore: prepare PayPal hackathon demo
release`. The one authorized push to GitHub `origin` failed with exit 128
because Git could not read a GitHub username with terminal prompts disabled.
Stopped at the authentication failure. The release commit remains local.
Vercel was not invoked and no deployment or Production change occurred.
This outcome entry is a local handoff update outside the release commit.

### 2026-11-10 — Task 09 public research and controlled Sandbox checkout

Local starting point: `paypal-hackathon-primary-release` at `bc477ca`,
tracking its existing origin branch. This is a different branch from the
earlier 08D-R2 failed push. No Git publication or Vercel action in Task 09.

- `web/src/app/api/paypal/research/route.ts`,
  `web/src/server/paypal/public-research.ts`, and
  `docs/public-research-quota.sql` add an anonymous, exact-origin research
  endpoint and a quota table for a separate, non-financial database. The
  runtime role can only read, insert, or update quota rows. Admission is
  atomic across instances, with up to three evaluations per daily visitor
  hash and 24 globally per UTC day. No raw IP, prompt, or result is stored in
  the quota table. Missing quota configuration, quota DB failure, and
  exhaustion prevent all provider calls. At most two Tavily requests and one
  Gemini request per evaluation, without retries. Body read, quota admission,
  and provider steps are bounded at 2, 3, and 16 seconds respectively.
  Vercel function duration is 60 seconds. Local/hosted exact Host and Origin
  checks apply; hosted visitor identity uses Vercel's forwarded IP.
- `web/src/server/paypal/offer-discovery.ts`, `web/src/lib/offer-discovery.ts`,
  `web/src/components/navigation.tsx`, `web/src/components/offer-discovery.tsx`,
  `web/src/components/paypal-agent-console.tsx`, and
  `web/src/components/purchasing-chat.tsx` connect the existing Norway chat
  to research. The server applies the submitted USD demo budget (1–1,000
  cents), narrowed by any lower budget in the instruction, to its existing
  policy checks. Cited prices remain source claims rather than checkout
  quotes. Each discovered merchant remains ineligible for Earmark payment.
  Public manual checkout uses a safe cited merchant plan/price URL where
  available. It never guesses a checkout URL. Manual approval is browser
  state only, labeled **Not paid**. Judge mode, legacy route guards, and
  historical receipt handling stay unchanged.
- `scripts/paypal-agent-serve.ts`, `web/src/server/paypal/agent-checkout-config.ts`,
  `web/src/server/paypal/agent-checkout-http.ts`,
  `web/src/server/paypal/agent-checkout-payment.ts`,
  `web/src/server/paypal/agent-checkout-postgres.ts`,
  `web/src/server/paypal/agent-checkout.ts`, and
  `web/src/server/paypal/test-auth.ts` add the isolated `agent-09-v1`
  campaign namespace. This reuses the established loopback owner session,
  CSRF, synthetic $10 mandate / $6 purchase, exact merchant and buyer
  approval checks, durable attempt keys, and reconciliation service. No new
  campaign or payment record was created. Hosted public routes do not
  expose this workflow. For a separately authorized Sandbox run, start the
  established private runner with `PAYPAL_AGENT_CAMPAIGN=agent-09-v1`.
  Initialize and independently validate the fresh mandate and proposal.
  Only then set `PAYPAL_AGENT_CHECKOUT_EXECUTION=task09-one-sandbox-checkout`,
  `PAYPAL_AGENT_CHECKOUT_MANDATE_ID` to that mandate, and
  `PAYPAL_AGENT_BUYER_SEPARATE=true`. Leave
  `PAYPAL_AGENT_CAPTURE_MANDATE_ID` unset until separately authorized;
  setting it to that mandate permits the existing buyer-approved capture
  action. Buyer approval is verified from PayPal, never asserted by the UI.
- `scripts/check-web-boundary.mjs`, `scripts/preview-smoke.mjs`,
  `web/test/offer-discovery.test.ts`, and
  `web/test/paypal-agent-payment.test.ts` cover the new browser boundary,
  anonymous review, quota rejection, budgets, source gating, and Sandbox
  permissions. The five focused suites passed 108 tests using offline
  fixtures. No live provider calls, financial writes, or captures.

Final verification: public production build and its TypeScript checks
passed. The build manifest confirms a 60-second research function. Targeted
Prettier, zero-warning lint and `git diff --check` passed. The browser
boundary scan passed all 47 chunks and the secret scan found zero matches.
Chromium smoke passed seven PayPal pages, three legacy route denials, both
themes, four policy scenarios, deterministic Judge, and the mocked public
research and Not paid journey on desktop and narrow mobile. No browser
exceptions, external requests, wallet probes, or legacy API requests.
The disposable PostgreSQL 17 test confirmed atomic caps of 3 per visitor
and 24 globally across two concurrent connection pools, and confirmed the
runtime role cannot delete. The Windows launch wrapper initially waited
after the local server was ready; a separate loopback harness ran the
schema and assertions successfully, then shut down only that test server.
No hosted database was opened or modified.

For an authorized Vercel Preview, retain `NEXT_PUBLIC_DEMO_ONLY=true`,
`EARMARK_PUBLIC_DEMO_ONLY=true`, `EARMARK_ENABLE_TESTNET_EXECUTION=false`,
`PAYPAL_BACKEND_ENABLED=false` and `PAYPAL_PAYMENTS_ENABLED=false`. Leave the
existing global Gemini, Tavily/discovery, and Judge live flags disabled. Only
the new research handler scopes provider opt-in. Provision the quota schema
using the checked-in SQL in a separate Neon database, not the payment
database. Give the function its own least-privilege database login and
configure these Preview variables:

| Variable                           | Setting                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `EARMARK_PUBLIC_RESEARCH_ENABLED`  | `true` after quota and provider setup                                                |
| `EARMARK_PUBLIC_RESEARCH_ORIGIN`   | Exact stable Preview HTTPS origin, no trailing slash                                 |
| `EARMARK_RESEARCH_DATABASE_URL`    | Server-only direct TLS Neon quota role URL                                           |
| `EARMARK_RESEARCH_QUOTA_SECRET`    | Server-only random 32-byte value encoded as 64 hex characters                        |
| `TAVILY_API_KEY`, `GEMINI_API_KEY` | Server-only research credentials, preferably dedicated and capped with the providers |
| `GEMINI_COLLECTOR_MODEL`           | Optional supported Gemini collector model override                                   |

Do not provision PayPal, owner auth, financial database or Monad
configuration for the public Preview. Delete old quota rows periodically
using the quota administrator; the runtime role has no delete privilege.
After separate publication authorization, test one hosted research request
against genuine providers, inspect evidence and manual approval, confirm
Judge and payment restrictions, and leave Production unchanged. Set the
new research flag to false to disable the route without broadening any
other profile.

Wallet investigation: the [PayPal Wallet guide](https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal)
and [Payment Method Tokens API](https://developer.paypal.com/api/payment-tokens/v3/payment-tokens-create)
document customer mapping and distinguish merchant references from
PayPal-generated customer identity. They do not establish that a matching
Wallet payer ID plus an absent echoed merchant reference authenticates the
changed Vault customer from Task 07N-G. Keep the existing rejection. Ask
PayPal to explain the changed customer ID and omitted merchant reference
using the prior sanitized debug IDs and UTC timestamps. Merchant-initiated
transaction eligibility remains unverified. Autonomous saved-Wallet
execution remains disabled. No Wallet calls or code changes.

### 2026-11-10 — Task 09B public research first and hosted diagnosis

Task 09 is committed as `deb0d53` on the release branch. The exact
reported Preview redirects unauthenticated GETs to Vercel and returns HTTP
401 with `Protected deployment` on a schema-invalid research POST. The
older public alias returns HTTP 200 on its homepage and HTTP 404 at both
`/api/paypal/research` and `/api/judge-sandbox`. The browser integration
had no authenticated session available. The protected Preview's deployed
commit, environment values, quota schema and provider logs could not be
verified. The invalid POST could not reserve quota or call a provider.

In Task 09's source, the exact copy “The evaluation couldn’t finish” is
the generic non-research chat fallback. Public merchant research used
“Online research couldn’t finish” instead. The old homepage opened the
synthetic policy console and omitted the real research tab when its
availability GET failed. This establishes the wrong default and message
path. The client also omitted same-origin credentials on public research
and Judge policy requests, including the old research availability check.
On a Vercel-protected Preview this drops the hosting authentication cookie
from the API request even when the visitor can load the page. The chat now
uses same-origin credentials while Earmark research remains anonymous.
The exact original response remains unverified without an authenticated
runtime trace.

The direct Vercel path is POST `/api/paypal/research` → strict input,
Host, Origin and Vercel client address checks → Neon quota admission →
Tavily offer search → Gemini extraction → targeted Tavily merchant
verification → evidence and independent budget policy → Norway offer
cards. The direct handler scopes network enablement to this route. Keep
the legacy AI and execution flags disabled. The Node function allows 60
seconds, with a 2-second body read, 3-second quota deadline and up to three
16-second provider calls. This release uses the direct Vercel backend.

- `web/src/app/page.tsx`, `web/src/app/agent-checkout/page.tsx`,
  `web/src/app/layout.tsx`, `web/src/app/norway.css`, and
  `web/src/components/public-paypal-pages.tsx` replace the public
  demo-first shell with a clean Norway research entry point. The default
  page starts with an empty request and a USD budget control. Removed
  recorded activity, sandbox copy and demo navigation from the primary
  experience.
- `web/src/app/judge/page.tsx` and
  `web/src/components/paypal-agent-console.tsx` retain the deterministic
  scenarios and historical receipt on a dedicated route. Public research
  is no longer a tab in that console.
- `web/src/components/purchasing-chat.tsx` reports safe, distinct failure
  messages and rejects synthetic or offline responses in the default
  experience. The existing cited merchant link and manual intent still
  show Not paid. `web/src/server/paypal/offer-discovery.ts` removes the
  weather and SaaS keyword gate for normal product requests while keeping
  privacy and policy checks. `web/src/server/paypal/public-research.ts`
  distinguishes configuration, origin, quota, provider and timeout
  errors, with allowlisted server diagnostics. Quotas remain 3 per visitor
  and 24 globally per UTC day.
- `web/test/offer-discovery.test.ts` and `scripts/preview-smoke.mjs`
  cover general product input, upstream failure responses, public
  research by default, no synthetic substitution, and the separate Judge
  route.

For a separately authorized Vercel Preview, set `NEXT_PUBLIC_DEMO_ONLY=true`,
`EARMARK_PUBLIC_DEMO_ONLY=true`, `EARMARK_PUBLIC_RESEARCH_ENABLED=true`,
and `EARMARK_PUBLIC_RESEARCH_ORIGIN` to the exact serving HTTPS origin.
Set server-only `EARMARK_RESEARCH_DATABASE_URL` to the dedicated direct
Neon quota database with `docs/public-research-quota.sql` applied, and
`EARMARK_RESEARCH_QUOTA_SECRET` to 64 hex characters. Configure server-only
`TAVILY_API_KEY` and `GEMINI_API_KEY`. Use `GEMINI_COLLECTOR_MODEL` if a model
override is required. Leave `EARMARK_ENABLE_TESTNET_EXECUTION`,
`PAYPAL_BACKEND_ENABLED` and
`PAYPAL_PAYMENTS_ENABLED` off. The local environment lists both provider
key names but has no public research origin or quota configuration.
Next verify the protected Preview's deployment and failed request in
Vercel Runtime Logs, then run one authorized live-provider smoke test.
No provider calls, push, deployment, Production changes, or financial
operations occurred during this task.

Local verification passed 115 tests across six focused suites. The public
production build and TypeScript checks passed in the direct profile. Web
lint, targeted lint, formatting, smoke-script syntax and whitespace checks
passed. The browser boundary scan checked 49 chunks, and the secret scan
found zero matches. Chromium covered both themes, eight
public pages, four policy scenarios, desktop and narrow mobile, rejected
offline substitution, and the mocked merchant handoff marked Not paid.
The final rebuild and Chromium rerun also verified that a same-origin
cookie reached the research request. Browser checks made zero external,
legacy API, payment or wallet requests.

### 2026-11-10 — Task 09C approved Norway interface and research configuration

Compared Task 09B release `d833fb0` with the approved Norway baseline
`deb0d53`. Restored the original shell and navigation in
`web/src/components/public-paypal-pages.tsx`, the original layout hierarchy
in `web/src/app/layout.tsx`, the approved homepage title in
`web/src/app/page.tsx`, and the exact approved stylesheet in
`web/src/app/norway.css`. Public notice and navigation copy describes
research and disabled payments. `web/src/components/paypal-agent-console.tsx`
reuses the original conversation, budget and policy/activity rail with
real merchant research as its public conversation. The public home no
longer mounts the deterministic console or its fetch. The existing
`/agent-checkout` public alias shares the restored shell. `/judge` retains
the simulation controls. The visible historical Sandbox activity remains
explicitly recorded evidence.

On the deployed Task 09B code, `PurchasingChat` posts to
`/api/paypal/research`. The original `profile(env)` in
`web/src/server/paypal/public-research.ts` returns null for any unmet
prerequisite. The route then returns 404 with `PUBLIC_RESEARCH_DISABLED`.
The browser mapped an unstructured 404 to the same error. That message
alone could not identify a setting or even prove the route ran.

The public gate requires `EARMARK_PUBLIC_RESEARCH_ENABLED=true` and both
`NEXT_PUBLIC_DEMO_ONLY=true` and `EARMARK_PUBLIC_DEMO_ONLY=true`.
`EARMARK_ENABLE_TESTNET_EXECUTION`, `PAYPAL_BACKEND_ENABLED` and
`PAYPAL_PAYMENTS_ENABLED` must stay off, and TLS verification must stay
enabled. Provide a dedicated direct Neon `EARMARK_RESEARCH_DATABASE_URL`
distinct from the payment DB, the existing quota schema and role grants,
and a 64-hex-character `EARMARK_RESEARCH_QUOTA_SECRET`. For direct Vercel
research, provide server-only `GEMINI_API_KEY` and `TAVILY_API_KEY`. Expose
Vercel system environment variables so `VERCEL=1` is available. Set
`EARMARK_PUBLIC_RESEARCH_ORIGIN` to the exact serving HTTPS origin,
without a path, trailing slash or non-default port. A configured route
then checks both Host and Origin plus the Vercel client address, validates
the body and reserves quota before provider execution. Global
`AI_ENABLE_NETWORK`, `EARMARK_GEMINI_ENABLED` and
`EARMARK_OFFER_DISCOVERY_ENABLED` are not admission gates. Only the
admitted direct request overrides them to true internally.

The local shell and `web/.env.local` lacked both public-demo flags, the
research opt-in, origin, quota DB URL and quota secret. Both provider key
names were present. With the two demo flags supplied by the local public
profile, the absent research opt-in is still the first gate. No Vercel
token or CLI was available. A read-only request to the specified branch
Preview returned a 302, and the schema-invalid POST probe timed out. The
deployed environment and exact hosted missing prerequisite remain
unverified. No live provider request was attempted.

`web/src/server/paypal/public-research.ts` returns distinct 404 codes for
configuration failures and logs only their categories and prerequisite
names. `web/src/components/purchasing-chat.tsx` shows distinct copy for the
configuration categories and a bare route 404. The same-origin cookie,
quota, provider, evidence and budget logic stay in place. The release uses the direct Next.js provider pipeline.
`web/test/offer-discovery.test.ts` checks the new failure categories and
request-scoped provider flags. `scripts/preview-smoke.mjs` checks the
restored navigation, budget, composer and policy card, plus the separate
Judge route and the existing live-only and merchant handoff behavior.

Matched screenshot pairs are stored locally in `.tools/task09c/`, using
1440 × 1000 desktop and 390 × 844 mobile for the before and after views.
Hosted verification requires checking the target Preview's settings and
Runtime Logs, then one separately authorized valid research request after
the required Preview configuration is present. No Git commit, push,
deployment, Production action or financial operation was performed.

Verification passed 116 focused tests across six suites, targeted Prettier
and zero-warning lint, TypeScript and the production build. The secret scan
found zero matches and the browser boundary scan passed 48 chunks. Chromium
passed eight pages, three legacy route denials, four Judge policy scenarios,
both themes, responsive layout and the mocked public research and manual
handoff. The browser smoke verified same-origin cookie delivery, rejected
offline fixture output on the public surface and showed the manual state as
Not paid. Both screenshot pairs were captured after retrying intermittent
local Chromium navigation timeouts. The Norway stylesheet exactly matches
`deb0d53`. The branch independently advanced to empty author-verification
commit `45e4f1e` during the session. Task 09C changes remain unstaged and
unpublished.

### 2026-11-10 — Task 09D release recovery

- The Git remote is `aveidt96/earmark-paypal`. The release branch is
  `paypal-hackathon-primary-release`, and the authenticated branch API
  reported `45e4f1ebe7bc5cfc5708e7962b5514135af8d8fd`. GitHub confirmed the
  repository is private, `aveidt96` owns it and has admin and push
  permission, and the branch is reported as unprotected. Its default
  branch is `main`.
- Effective author and committer use the repository-local
  `189458132+aveidt96@users.noreply.github.com` identity. The global email
  differs, and no author or committer environment override was present.
  Credential Manager had two GitHub accounts, so the read-only API lookup
  explicitly selected `aveidt96`. GitHub returned user ID `189458132` and
  author and committer attribution to `aveidt96` for both `45e4f1e` and
  `d833fb0`. The email-list API did not authorize access, so direct
  verification of the Task 09B address in account settings was unavailable.
- GitHub's Vercel status histories for both commits contained pending then
  success for `samuelid22/earmark-paypal`. Neither contained the reported
  author-block event. The local Vercel link names `earmark-paypal` and
  includes a team scope. Read-only Vercel account, team and project
  requests all returned HTTP 403. The workspace owner, Login Connections,
  GitHub installation grants, actual blocked deployment, and Preview
  environment are still unknown. Do not infer Vercel authority from
  GitHub repository ownership or historical authorship.
- The hosted message still maps to the Task 09B research admission 404
  or its bare-404 browser fallback. The first missing local gate remains
  `EARMARK_PUBLIC_RESEARCH_ENABLED`. Both public-demo flags, origin, quota
  URL and quota secret were absent locally. The two provider keys were
  present by name. Hosted configuration and live providers were not tested.
- `web/src/server/paypal/public-research.ts`,
  `web/src/components/purchasing-chat.tsx` and
  `web/test/offer-discovery.test.ts` now distinguish a canonical HTTPS
  origin with no Vercel runtime indicator from a malformed origin. This
  adds a safe `VERCEL` prerequisite diagnosis without changing admission.
  The Task 09C Norway UI is preserved.
- The exact 10-path release delta, including the Task 09C handoff,
  is at `.tools/task09d/task09d-release.patch`. Its base is `45e4f1e`,
  and its Git tree is `a8aa5de1be11eb3e9044c8f454929f953c80d272`.
  The isolated source snapshot has the published lockfile, exact approved
  Norway CSS, and a direct Next.js research handler with no Task 10 imports.
  The working tree still contains the separately paused Task 10 work.

For the blocked event, open Vercel Deployments and locate the exact
blocked SHA and target project. Switch to that project's owning Hobby
workspace and confirm its owner account. In that owner's Account Settings
→ Authentication → Login Connections, verify GitHub `aveidt96` is linked.
In Project Settings → Git, confirm `aveidt96/earmark-paypal` is connected
and the release branch is a Preview branch. In GitHub Settings →
Applications → Installed GitHub Apps → Vercel, confirm this repository
is included. If those all match, use the failed deployment ID and SHA in
a Vercel support case. Keep account and repository changes separately
authorized.

For a subsequent authorized Preview, verify project root `web`, the Next.js
Node runtime and the research route's 60-second duration. Scope the required
variables described in Task 09C to the release branch's Preview environment,
and expose Vercel system variables. Set the origin to the exact HTTPS host
used by the browser, without a trailing slash. Confirm the separate direct
Neon quota database, existing quota schema and role grants. Keep all PayPal
and Monad execution disabled. Use the tested tree for the next real
release-branch commit, then check one separately authorized live research
request on the configured Preview. No Git stage, commit, push, deployment
or account change was made by Task 09D.

### 2026-11-11 — Task 09D verification completion

- Continued the interrupted verification without changing application behavior.
  Updated this handoff's current-state summary and recorded the actual final
  results. The frozen 10-path candidate/tree documented above is unchanged;
  this final verification log remains outside that frozen snapshot.
- Verified the isolated candidate, not the mixed working tree containing paused
  Task 10 changes. Passed: 110 tests in five discovery, Judge, agent/payment and
  checkout suites; agent TypeScript build; production web TypeScript check;
  changed-code Prettier; zero-warning Biome lint over 166 files; production
  Next.js build/static generation; 48-chunk browser boundary scan; release-source
  and compiled-browser credential scans; patch application/whitespace checks;
  and fresh working-tree `git diff --check`. The compiled research route declares
  maxDuration 60. No live provider behavior is proved by these offline checks.
- The first resumed standard preview smoke failed at its initial homepage
  navigation with Playwright's 30-second load timeout. A local diagnostic copy
  at `.tools/task09d/release/scripts/.task09d-preview-smoke.mjs` enabled server
  output and a bounded 90-second navigation timeout, without changing the
  production source or checked-in smoke assertions. That complete run passed:
  eight PayPal pages, three legacy-route denials, both themes, four policy
  scenarios, deterministic Judge, offline public research/manual checkout,
  restricted endpoints and disabled payments. No browser exceptions, external
  requests, legacy API requests or wallet probes; no overflow at 1440, 1280,
  1024, 390 and 375 pixels. Aborted `/security` navigation/prefetch requests
  appeared during route changes; all final route/assertion checks passed.
  The cause of the initial local load delay is not established.
- Fresh screenshots are local-only under `.tools/task09d/release/.tools/`,
  including `paypal-norway-1440.png`, `paypal-norway-390.png`, Classic Light,
  Judge and discovery views. Matched before/after restoration comparisons
  remain `.tools/task09c/before-desktop.png`, `after-desktop.png` (1440x1000),
  and `before-mobile.png`, `after-mobile.png` (390x844). Norway CSS remains
  identical to the approved Task 09 baseline.
- Publication must use the isolated direct-Vercel patch, not stage the entire
  current worktree. Paused Lambda source/dependencies, 11 diagnostic scripts,
  all `.tools` evidence and environment/credential files remain excluded.
  The real Git index is empty. No commit, push, deployment, account/settings
  change, provider evaluation, database mutation or financial operation was
  performed. Monad and unattended saved-Wallet execution remain disabled.
- Remaining actions: inspect the exact reported blocked deployment and owning
  Vercel Login Connections; confirm branch-specific Preview configuration and
  dedicated quota database/schema; separately authorize publication/deployment
  and one genuine provider smoke. Local offline verification is complete;
  hosted research success and the original author-block cause remain unproven.

### 2026-11-11 — Authorized recovery publication

User authorized one recovery commit and normal push to the existing
paypal-hackathon-primary-release branch. Author and committer are aveidt96
using its GitHub noreply identity. Task 09 commit deb0d53 is an ancestor;
the remote branch matched the reviewed base 45e4f1e before staging.

The release contains HANDOFF-PAYPAL.md, scripts/preview-smoke.mjs,
web/src/app/layout.tsx, web/src/app/norway.css, web/src/app/page.tsx,
web/src/components/paypal-agent-console.tsx,
web/src/components/public-paypal-pages.tsx,
web/src/components/purchasing-chat.tsx,
web/src/server/paypal/public-research.ts and
web/test/offer-discovery.test.ts. These restore the approved Norway
composition and diagnose research configuration while preserving quotas,
Judge, evidence validation and disabled payment/Monad execution.

Application and test blobs match the previously tested direct-Vercel
candidate. Only the handoff gains the final verification/publication log.
Paused Task 10 Lambda code/dependencies, 11 diagnostic scripts, .tools,
environment files, credentials and private local evidence are excluded.
No manual Vercel action or Production promotion is authorized. Git push
may activate the existing Vercel Git integration. Actual commit/push
outcome will be recorded in the local handoff after the operation.

### 2026-11-11 — Synchronize main with primary hackathon release

User requested bringing main up to date with paypal-hackathon-primary-release.
Fetched origin and verified the clean checkout, original main 9bd3343 and
release head 0945d04. The release still descended from the old 723662b history,
whose tree is identical to corrected main. Backed up main locally and replayed
exactly the six subsequent release commits onto corrected main, preserving every
source tree, commit message, author/committer timestamp, and commit order.
Corrected the author and committer email on 35133d5 from idowusoft24@gmail.com
to 189458132+aveidt96@users.noreply.github.com; GitHub confirmed that the old
email mapped to DavidIdowu992. All other release identities were preserved.
The existing release branches are unchanged.

The synchronized application and configuration files match release 0945d04
exactly. HANDOFF-PAYPAL.md is the only additional file modified for this
operation, to satisfy the repository documentation rule. Verified all six
replayed commit trees, messages, dates and mapped parent relationships, final
release-tree equality before this log, and ancestry from the existing main.
Git identity remains repository-local aveidt96 with the GitHub noreply email.
No application tests or build were rerun for this Git synchronization; this
entry makes no fresh application or hosted-runtime validation claim.
A normal push of main is authorized by the user and follows a final fetch and
remote-head check. No deployment command, provider request, database mutation
or financial operation was performed. An existing Git integration may react
to the push; deployment success is not established by this operation.

### 2026-11-11 — Production research quota diagnostics

The reported Production warning came from the quota reservation in
`web/src/server/paypal/public-research.ts`. The shared `agent/src/postgres.ts`
helper permits a ten-second connection attempt and validates a direct Neon
URL. Previously a three-second route deadline and a single generic warning
hid the difference between URL validation, connection, authentication,
permissions, missing relations, and SQL failures. The table was reported
created. The connected Neon tool is scoped to testnet, so the failing
Production connection and runtime role have not been verified.

- `web/src/server/paypal/public-research.ts` uses an eight-second quota
  deadline inside the existing 60-second route. The two-second body read,
  eight-second quota, and three 16-second provider allowances total 58
  seconds. The single atomic statement, UTC accounting, three-per-visitor
  and 24-per-day limits, 429/503 responses, and provider admission stay in place.
  A late connection is released before starting SQL. A timed-out query's
  client is discarded. The shared connection helper remains unchanged.
- `web/test/offer-discovery.test.ts` checks safe diagnostic fields, 503 on
  quota failure, and connection/query deadline cleanup with fake timers and
  clients. The offline tests make no live provider evaluation.

In the original earmark-paypal Production runtime logs, filter for the
`/api/paypal/research` path and `public-research: quota storage unavailable`.
Read `classification`, `elapsedMs`, and an allowlisted `pgCode` when present.
`direct_neon_url_required` or `unsupported_database_url_option` means the
shared URL validator rejected the connection configuration. `28P01` or
`28000` points to authentication. `42501` points to the quota role's schema
and table grants. `42P01`, `3F000`, or `3D000` points to the selected Neon
branch, database, schema, or table. The connection and query timeout labels
show where the deadline was reached. `57014` is a PostgreSQL query
cancellation and can indicate its statement deadline. For `query_failed`,
use the reported SQLSTATE to inspect the server failure.

The focused change is prepared in `.tools/task09-quota` from current main
`fc3b3e4`. Local locked workspace dependencies and generated build files are
excluded from publication. The unrelated local UI candidate and paused
Lambda work remain outside this change. Validation and push results follow.

Validation passed on Node 22.14.0 with the locked offline workspace install.
The 56 focused discovery and PostgreSQL helper tests, workspace and API
TypeScript checks, formatting and warning-free lint passed. The production
Next.js build completed strict TypeScript checking, static generation of 16
pages and route tracing. The 48-chunk browser boundary scan passed. The
atomic quota SQL matched main exactly. Validation used offline fixtures.
GitHub main still matched the release base at the pre-push check.

### 2026-11-11 — Norway Production UI integration on current main

Verified `origin` as `https://github.com/aveidt96/earmark-paypal.git` and
fetched `main` at `1dded523c7caf72417197098185282785a1ce954`. This revision
contains the research route and the deployed eight-second quota diagnostics.
The previous local candidate was based on `9bd3343`, the older checkpoint
that lacked the route. GitHub main has since been synchronized.

Integrated the approved files in `.tools/task09-quota` after matching every
reviewed before-and-after blob hash against current main and the saved UI
review. The research route, quota implementation and tests, Norway CSS,
provider and financial code, and dependency files match current main.
The manifest is scoped to the UI correction and its browser coverage.

- `web/next.config.ts`, `web/src/app/page.tsx`, `web/src/app/layout.tsx`,
  and `web/src/lib/paypal-agent.ts` select the public Norway experience
  for Vercel Production and enforce the compiled public restrictions.
- `web/src/components/public-paypal-pages.tsx`,
  `web/src/components/paypal-agent-console.tsx`, and
  `web/src/components/purchasing-chat.tsx` retain the approved layout and
  show a blank comparison budget, merchant research, and payment status.
- `web/src/app/mandates/page.tsx`, `web/src/app/activity/page.tsx`,
  `web/src/app/payments/page.tsx`, `web/src/app/security/page.tsx`, and
  `web/src/app/paypal-test/page.tsx` use public status pages.
  `web/src/app/judge/page.tsx` presents the separate policy scenarios and
  historical evidence in the existing demo layout.
- `scripts/preview-smoke.mjs` verifies public research and Judge isolation.
  `HANDOFF-PAYPAL.md` records the integration and verification.

Combined validation is running with provider traffic blocked. It uses the
locked workspace dependencies already installed in the isolated checkout.
The reviewed candidate and paused work remain in their original locations.

Combined validation passed on Node 22.14.0. All 174 focused tests across
eight suites, workspace and API TypeScript checks, formatting, and
zero-warning lint passed. The Production Next.js build passed compilation,
strict TypeScript, static generation of 16 pages, and route tracing.
Vercel Production compiled public mode true with the deliberately false
test flag. The research route remains a 60-second Node function and the
48-chunk browser boundary check passed.

The existing Chromium smoke passed across eight pages, three legacy-route
denials, both themes, five viewport widths, and four Judge scenarios.
It checked the research POST and Not paid handoff with offline fixtures.
Browser exceptions, external requests, legacy API requests, and wallet
probes were zero. There were no live provider or financial operations.
The ignored `.tools/production-smoke.mjs` copy in the isolated checkout
uses a 90-second navigation timeout. Browser screenshots and build outputs
are local-only.

### 2026-11-11 — Merchant research suitability and verified checkout navigation

The local review candidate is based on fetched `origin/main` at
`9cf3647039cf1c4df1c2fdfb2f87967147ebec01`, in the existing isolated checkout
under `.tools/task09-quota`. The working release and paused Lambda changes in
the primary checkout remain separate. Publication requires review of this diff.

- `web/src/components/offer-discovery.tsx` uses research suitability in the
  Norway cards, shows separately sourced price, billing period, features and
  PayPal evidence, and states the external payment limitation once per result.
  Manual review and rejection remain available. Approval remains session-only
  and explicitly not paid. Checkout and plan links require cited safe HTTPS
  destinations. Approval is disabled when neither destination is available.
- `web/src/components/purchasing-chat.tsx` uses the same verified destination
  rules for public and owner research. `web/src/components/paypal-agent-console.tsx`
  removes redundant public payment notices from the rail. The Judge UI
  continues to omit manual checkout controls.
- `web/src/lib/offer-discovery.ts` adds optional checkout, feature and billing
  evidence to the research result and validates public plan checkout selectors.
  `web/src/server/paypal/offer-discovery.ts` asks for checkout evidence in the
  existing offer search and independently matches the retrieved title, merchant
  host and exact plan selector. It requires a cited merchant plan or pricing
  page and uses that page as the fallback. Generic, third-party, session-bound,
  redirect and ambiguous URLs do not qualify for direct checkout. Explicit
  named-tier feature and billing evidence can be shown with an unknown price.
  The two Tavily/one Gemini budget and independent merchant and mandate policy
  remain in place. No external offer gains payment authorization.
- `web/test/offer-discovery.test.ts` covers exact-tier checkout and unsafe or
  unrelated destinations, independent billing and feature evidence, unknown
  PayPal acceptance, and the no-payment result. `scripts/preview-smoke.mjs`
  checks both destination types, safe new-tab attributes, local approval and
  rejection, and the absence of financial mutation requests.

The local checks use offline provider fixtures. Source matching does not
establish current merchant availability, checkout completion, or PayPal
acceptance. No live provider, merchant, or payment operations were performed.

Validation on Node 22.14.0 passed: 87 focused tests in discovery (including
public research quota and route checks), Judge, and PayPal agent payment
suites. Workspace/API TypeScript and the final Next.js production build passed,
including TypeScript, 16 static pages, and route tracing. Prettier, zero-warning
Biome lint, browser boundary (48 chunks), changed-line credential-pattern scan,
and diff whitespace checks passed. Initial checks caught an optional fixture
prop, an unused type import and a handoff trailing blank line. All were corrected.

Chromium passed on the production build using offline fixtures and the
existing ignored runner copy with a 90-second navigation timeout. It verified
eight PayPal routes, three legacy denials, both themes, five widths and four
Judge scenarios. It checked exact checkout and pricing destinations at 1440
and 390 pixels, the Not paid state, rejection, and that the only mutation
requests were the intercepted research POSTs. Browser exceptions, external
requests, legacy API requests and wallet probes were zero.

No files were staged or committed. No push or deployment was performed.

### 2026-11-11 — Production research deadlines, budget and Norway spacing

The local review candidate extends the unpublished merchant-checkout changes
on main's `9cf3647` baseline in `.tools/task09-quota`. The primary checkout's
paused Lambda work remains separate.

- `web/src/server/paypal/public-research.ts` validates integer research cents
  before quota admission. It sets a 55-second deadline from handler entry
  under the existing 60-second Vercel route limit and maps provider-stage
  failures to safe public errors. The 8-second quota deadline, accounting,
  origin rules and provider request counts are unchanged.
- `web/src/server/paypal/offer-discovery.ts` gives the initial Tavily search
  up to 16 seconds, Gemini up to 32 seconds from the remaining deadline with
  12 seconds reserved for the final payment-evidence search, and that final
  search up to 16 seconds. The prior Task 07P-T2 lookup took 9,851 ms to
  headers. No provider retries or unverified fallback results were added.
  Failure logs contain only the stage, classification, elapsed
  time, timer limit and provider HTTP status if available.
- `web/src/lib/offer-discovery.ts`, `web/src/components/purchasing-chat.tsx`
  and the research API/boundary accept USD 0.01 through USD 100,000.00 in
  exact cents. Gemini and offer comparison receive the selected amount. An
  explicit smaller instruction ceiling can still narrow the comparison.
  The Judge and owner-local defaults and all financial policies are unchanged.
- `web/src/components/offer-discovery.tsx` and `web/src/app/norway.css` group
  card evidence, selected budget, price, billing, sources and review actions
  with public-research-only spacing. Suitability, verified merchant links,
  the compact unavailable-payment notice and the Not paid state remain.
- Public headings, research results, timeout copy and privacy text use
  Earmark AI. `web/src/components/paypal-agent-console.tsx` and
  `web/src/components/agent-checkout.tsx` update visible attribution without
  changing the provider pipeline, evidence citations or Judge behavior.
- `web/test/offer-discovery.test.ts` exercises exact outbound and comparison
  budgets, each provider timeout, upstream 504 classification and shared
  deadline math. `scripts/preview-smoke.mjs` covers larger desktop/mobile
  budgets and preserves the existing payment and Judge checks.

The old app mapped provider aborts from all three 16-second stages to
`MODEL_TIMEOUT`. It also used the same UI text for a hosting HTTP 504.
The linked Vercel Production log read returned no matching runtime or request
records in the available 45-minute window, and a 24-hour query exceeded
retention. The original incident cannot be assigned to a provider from that
evidence. After publication, filter `/api/paypal/research` for
`public-research: provider stage failed` to see the stage and classification.

Remote main was verified read-only at
`9cf3647039cf1c4df1c2fdfb2f87967147ebec01`. Node 22.14.0 validation passed:
99 focused tests across discovery/quota, Judge and agent-payment suites,
workspace/API TypeScript, final Next.js Production build with strict
TypeScript and 16 static pages, Prettier, zero-warning Biome lint, the
48-chunk browser boundary scan, credential-pattern scan and diff whitespace.
Early checks found a fixture asserting the wrong outbound property, CSS
selector specificity warnings and a browser assertion matching the Next.js
route announcer. Each was corrected and the relevant checks rerun.

The full Chromium smoke passed for eight PayPal routes, legacy denials,
four deterministic Judge scenarios, review-only checkout, public branding
and responsive behavior. A separate offline capture checked Norway and
Classic Light at 1440, 820 and 390 pixels, with no horizontal overflow.
It submitted the $5, $25, $100, $500 and $1,000 budgets, rejected invalid
inputs, and verified the specific offer-comparison timeout message.
Twelve matching screenshots are in `.tools/research-layout/` within this
isolated checkout. The ignored local screenshot runner and production smoke
copy are local artifacts. No runtime exceptions, external requests, wallet
probes or financial mutation requests occurred in browser validation.

The Vercel log query was read-only. No live research, payment operations,
staging, commit, push or deployment occurred. The cumulative local review
diff is `.tools/research-workflow-review.diff` in the primary checkout.

### 2026-11-11 — Final research deadline and privacy review

GitHub's read-only comparison confirmed that `main` is still
`9cf3647039cf1c4df1c2fdfb2f87967147ebec01`. The application diff matches the
reviewed candidate. The compiled research route has a 60-second duration.
Its 55-second clock starts at handler entry, so the request body read and
8-second quota check reduce the time remaining for the providers. Up to
five seconds remain for bounded response processing and hosting overhead.
No application timing or UI change was necessary.

The quota SQL matches `origin/main`, retaining 3 per visitor per UTC day
and 24 total per UTC day. The local page served HTTP 200, retained Earmark AI
and disclosed that requests go to search and AI providers. Norway spacing,
research budgets and manual checkout controls match the reviewed app diff.

`web/test/offer-discovery.test.ts` adds two offline regressions covering a
1.9-second request body, a 7.9-second quota admission, both earlier provider
stages and a delayed final provider response body. The handler returns the
completed response at 54.8 seconds with the shorter body and cancels the
longer body at 55 seconds with the stage-specific 504. These are simulated
times and do not include a hosted Vercel cold start.

Prettier and zero-warning Biome lint passed. The existing Node 22.14.0
Production build was reused because the reviewed application diff matched
exactly. Its 48-chunk browser boundary scan passed. Two existing tests
and a Judge fixture assertion hit five-second test limits during the first
concurrent run. A serial rerun passed all 101 focused tests, workspace/API
TypeScript, and the complete eight-page Chromium smoke without changing test
limits. Smoke covered both themes, Judge isolation, responsive research
and review-only checkout with no browser exceptions or external requests.
The local validation log is ignored under
`.tools/final-research-timing-validation.log` in this checkout.

No live provider requests, payments, staging, commits, pushes or deployments
occurred. The release remains local and awaits publication authorization.

### 2026-11-11 — Production publication of the reviewed research release

Fetched `origin/main` over HTTP/1.1 after the initial Git connection timed
out. The fetched tip matched the reviewed base `9cf3647`. The 11 staged
paths and committed diff matched the approved review artifact exactly.
The staged whitespace and credential-pattern checks passed. Reused the
approved 101-test, TypeScript and Chromium validation because no release
source changed after review.

Committed `3c9817089c96211838c97f4825f77034e0abe93b` as `aveidt96` and pushed
it normally to `main` as a fast-forward. The original Vercel project
`earmark-paypal` reported `READY` for the exact SHA on Production. The
`https://earmark-paypal.vercel.app` alias points to
`https://earmark-paypal-4i6e5remj-samuelid22.vercel.app`. Its GitHub Vercel
check passed. The same Git push automatically triggered a failed check in
the separately linked `earmark-paypal-i2bk` project. No direct action or
configuration change was made in that project.

The masked Production inventory still has the same 19 variable names.
No environment values were printed or changed. Read-only Production
checks showed Earmark AI and the third-party provider disclosure, a working
Judge page, research configured, and PayPal payment execution disabled.
An initial read-only verification script collided with a reserved
PowerShell variable and was corrected. A static JavaScript download timed
out in the subsequent run, so that scan was retried separately.

No live provider evaluation, payment, financial data mutation or manual
deployment was performed. The live research request remains for the user's
manual Production test. This publication note is local and was added after
the reviewed commit.

The bounded retry read the original Production homepage and all 10 public JavaScript chunks it references. The scan found zero credential-pattern matches.

### 2026-11-11 — Recover from public offer comparison failures

The original Production Vercel logs recorded Gemini HTTP 503 after 2.321
and 26.520 seconds, plus a 32.004-second local comparison timeout with
no upstream response headers. The three requests reached comparison after
the quota check and initial merchant search.

`web/src/server/paypal/offer-discovery.ts` retries only an early comparison
503, once, after a 750 ms delay and with at least 12 seconds still available
in the original comparison window. Both sends pass the same outbound guard
and share the same abort signal and deadline. `web/src/server/paypal/public-research.ts`
logs the retry with safe timing data and returns a separate source-only
result on a comparison timeout or 503. The result contains URL links from
the validated initial search. It contains no offer, prices, recommendation,
eligibility verdict or payment action. One quota admission still covers the
whole request, with the existing 55-second total and 12-second payment
evidence reserve.

`web/src/lib/offer-discovery.ts` defines the response type.
`web/src/components/purchasing-chat.tsx` accepts it only for public research,
checks the links again and clears prior results. `web/src/components/offer-discovery.tsx`
shows Comparison incomplete with unverified sources. `web/src/app/norway.css`
wraps long source URLs. `web/test/offer-discovery.test.ts` checks retry,
unchanged deadline, terminal errors, sanitized logging, source filtering
and quota count. `scripts/preview-smoke.mjs` covers the source-only response,
unsafe link filtering, narrow viewport and absence of checkout controls.

Node 22.14.0 passed 113 focused research, Judge and agent-checkout tests.

### 2026-11-12 — Offer comparison recovery verification

The initial TypeScript check caught an explicit-undefined assignment to an
optional property. The type was corrected and the workspace/API check
passed. The default Biome scan skipped the nested `.tools` checkout.
The focused run with the checkout's config found a new CSS specificity
warning, which was corrected. All eight changed code/test files then
passed zero-warning lint and Prettier. Two informational regex suggestions
concern existing code. The Node 22.14.0 Next.js Production build completed,
including TypeScript, 16 static pages and route tracing. All 48 browser
chunks passed the boundary scan. The changed-code credential-pattern and
Git whitespace checks passed.

Full offline Chromium smoke passed eight PayPal pages, both themes, five
viewport widths and the Judge flows. The 390px incomplete-comparison case
showed one safe source link, filtered a non-HTTPS fixture link, hid checkout
controls and had no horizontal overflow. The smoke reported zero browser
exceptions and zero external requests. No live provider evaluation,
financial operation, staging, commit, push or deployment occurred.
Publication and a separately authorized live check remain pending.

### 2026-11-12 — Offer comparison recovery deployed to Production

Fetched GitHub `main` and verified it matched tested base `3c981708`.
Published the eight reviewed recovery files in `f56e35f48548279d15108d23ec711eed81901486`
as `aveidt96`, using one normal fast-forward push to `origin/main`.
The staged and committed diffs matched the tested candidate. Staged
whitespace and credential-pattern scans passed. Handoff and local
artifacts remained outside the commit.

Direct Vercel REST inspection returned 403. The authenticated CLI verified
the original project `earmark-paypal` reached `READY` for the exact SHA,
with the public alias `https://earmark-paypal.vercel.app` pointing to
`https://earmark-paypal-53sg4hkjw-samuelid22.vercel.app`. The research
function is Node.js 22 with a 60-second duration. The original project's
GitHub deployment check succeeded. The separately linked
`earmark-paypal-i2bk` check failed independently.

Read-only GET checks returned HTTP 200 on the homepage and research
readiness route, which returned available. The published diff retains
the already verified 113 focused tests and offline build/browser results.
No live provider evaluation or financial operation occurred during release.
The user retains the manual Production research check.

### 2026-11-12 — Prepare higher research quotas for judging

Production's published route uses three admissions per network address
and 24 total per UTC day. The existing dedicated research schema bootstrap
also constrains `used` to at most 24. A higher runtime limit requires
expanding that database constraint before activation.

- `web/src/server/paypal/public-research.ts` accepts optional server-only
  `EARMARK_RESEARCH_VISITOR_DAILY_LIMIT` and
  `EARMARK_RESEARCH_GLOBAL_DAILY_LIMIT` as canonical integers from 1 to 120.
  Missing settings retain 3 and 24. Invalid settings fail configuration
  validation. The existing PostgreSQL upsert binds both limits as parameters,
  keeping both conditions in the same atomic admission.
- `docs/public-research-quota-capacity.sql` changes the existing research
  table's check constraint from 24 to 120 in one transaction, with a short
  lock timeout. It preserves rows and grants. `docs/public-research-quota.sql`
  now creates fresh research databases with the 120 ceiling.
- `web/test/offer-discovery.test.ts` verifies defaults, rejects invalid
  settings, checks the SQL parameters and confirms a denied admission never
  reaches a provider. The ignored `.tools/quota-capacity-proof.mts` runs
  the actual upsert and migration on disposable loopback PostgreSQL 17.

Recommended judging settings are `EARMARK_RESEARCH_VISITOR_DAILY_LIMIT=12`
and `EARMARK_RESEARCH_GLOBAL_DAILY_LIMIT=120`. These are public research
limits, shared by people behind the same IP and by all traffic on the site,
respectively. Confirm the original database's `daily_quota_used_check`
before running the migration as owner on the dedicated research database.
Apply the migration first, then publish the candidate with those variables
on the original `earmark-paypal` Vercel Production project. Remove the two
settings and redeploy to return to 3/24 after judging. The 120 database
ceiling is compatible with the lower application caps. Existing UTC-day
counts remain in place throughout.

Node 22.14.0 passed all 114 focused tests, the Next.js Production build
including TypeScript, the 48-chunk browser boundary scan, focused
zero-warning Biome lint, formatting, and `git diff --check`. The first
local PostgreSQL proof passed the migration and concurrency assertions but
hit its statement timeout creating a separate database for a fresh-install
check. The fixture was shut down. The rerun passed using a rollback
transaction for the fresh schema. PostgreSQL 17 preserved the original
quota row, enforced both 3/24 and 12/120 across two concurrent pools,
rejected use above 120, and confirmed the application role cannot delete.
The second fixture was shut down successfully.

No production database changes, provider calls, financial operations,
Git publication or deployment were performed. Before judging, verify
provider headroom and run a separately authorized manual research check.
The Production retry and source-only fallback remain available when
Gemini is slow or unavailable.

### 2026-11-12 — Restore visitor quota after a terminal Gemini 503

The Production handler charged both counters at admission before it
contacted a provider. A final 503 therefore consumed a visitor slot even
when the response had no comparison. `web/src/server/paypal/public-research.ts`
now uses the same UTC day for admission and refund, and restores one
visitor slot after a confirmed terminal Gemini comparison 503. A
successful retry counts once. The site-wide `used` counter continues to
bound actual admitted provider work, including failed requests. Refund
work shares the request deadline and has the existing eight-second DB cap.
An unavailable refund is logged without identifiers and the source
fallback still returns. There is no retroactive credit or reset of counts.

`web/test/offer-discovery.test.ts` verifies that only the final 503
restores a slot, that a successful retry counts once, and that a stalled
refund preserves the fallback. The ignored
`.tools/quota-capacity-proof.mts` now also verifies refund isolation,
no underflow, and preservation of the global counter against disposable
PostgreSQL 17. All 115 focused tests, the combined Node 22 Production
build and TypeScript, the 48-chunk browser boundary scan, focused lint,
formatting, whitespace and staged credential-pattern checks passed.

The only four paths in local commit `b310a33144cda973b2d9e3b025341864ae0c32a3` are
`web/src/server/paypal/public-research.ts`, `web/test/offer-discovery.test.ts`,
`docs/public-research-quota.sql`, and `docs/public-research-quota-capacity.sql`.
The ignored `.tools/quota-production-preflight.mts` reports only sanitized
schema/access facts. Vercel lists the research database variable, but the
protected value was unavailable in the local CLI environment. The Neon
connector is scoped to `earmark-testnet` and the browser reached sign-in.
The dedicated research owner connection remains required before the 120
database migration. The Vercel Production quota override names were both
absent, so the refund can be released with the current 3/24 limits while
the higher settings await the migration.

### 2026-11-12 — Gemini 503 visitor refund published at current limits

Pushed `b310a33144cda973b2d9e3b025341864ae0c32a3` to GitHub `main` as a normal
fast-forward with the four verified files. The original Vercel
`earmark-paypal` Production project reached `READY` for that exact
commit and the public alias resolves to
`earmark-paypal-58b4mi54x-samuelid22.vercel.app`. The research readiness
GET returned HTTP 200 with `available: true`. The original deployment
check succeeded. The separately linked `earmark-paypal-i2bk` check failed.

Production runs the visitor refund with the existing 3/24 limits. The
two override names were absent and no production quota migration or Vercel
setting was applied. The user selected connecting the dedicated Neon
research project. The last scope check still returned `earmark-testnet`.
After reconnecting, verify the research database identity and owner
role, apply `docs/public-research-quota-capacity.sql`, then set
`EARMARK_RESEARCH_VISITOR_DAILY_LIMIT=12` and
`EARMARK_RESEARCH_GLOBAL_DAILY_LIMIT=120` on the original Production
project and verify the redeployment. No live research or financial
operation was performed.

### 2026-11-12 — Research connector authenticated, current chat needs refresh

The user added and approved the project-scoped `neonresearch` connector.
Read-only local Codex checks confirmed OAuth authentication and availability
of both the SQL and transaction tools in a fresh app-server process.
The active chat still exposes only `Neon` scoped to `earmark-testnet`;
looking up `neonresearch` in the chat returned unknown server. The
documented app-server resume was refused because the active chat already
has a writer. No migration or Vercel change was attempted.

The ignored isolated artifacts `.tools/neon-codex-rpc-schema/` and
`.tools/neon-research-rpc.mjs` supported this read-only diagnosis.
Refresh the MCP tools by restarting Codex after authentication and
opening a fresh chat in this workspace if needed. The previously approved
migration and 12/120 activation remain pending.

### 2026-11-13 — Fix live public AI research reliability (`offer_analysis`)

Inspected read-only Vercel `earmark-paypal` Production logs and environment
metadata for `dpl_3z9xeeTnviL7FXZ4dUnZoBKLELh5` (`b310a33`):

- Vercel Hobby runtime log retention is 30 minutes (`vercel logs runtime --since 60m`
  and `--since 48h` returned HTTP 400); `vercel logs runtime --since 30m` returned 0
  records (`2026-11-13T01:28:44.627Z–01:58:44.627Z`).
- `vercel logs requests` showed two `POST /api/paypal/research` requests at
  `2026-11-12T18:01:00.110Z` (`fb8mk-1794506460110-7b3cacb3bb37`) and
  `2026-11-12T18:04:40.725Z` (`mtgb2-1794506680725-a6eb57a2342a`), both returning
  HTTP `200` (which matches both full discovery and `offer_analysis`
  `incompleteComparison` fallback, whereas `INVALID_MODEL_RESPONSE` /
  `DISCOVERY_REPORT_REQUIRED` would have returned HTTP `502`). Prior recorded
  Production runtime logs (`2026-11-11` entry) isolated post-Tavily failures to
  `offer_analysis` (Gemini HTTP `503` at `2.321s` and `26.520s`, and one `32.004s`
  local timeout).
- Masked `vercel env ls production` confirmed neither `GEMINI_MODEL` nor
  `GEMINI_COLLECTOR_MODEL` is set, so Production defaults to `gemini-3.8-flash`
  with no fallback collector configured. Local live traces used
  `gemini-3.5-flash-lite` cleanly with `reportDiscoveredOffers` and
  `{ thinkingLevel: "low" }`.

Changed files in `.tools/task09-quota` (`main` worktree at `b310a33`, local only):

- `web/src/lib/offer-discovery.ts`: Exported `SearchSourceCategory` (`"pricing" | "docs" | "web"`),
  `PartialSearchSource`, and extended `IncompleteComparison` with optional
  `results` and `retrievedAt` (preserving `sources` compatibility).
- `web/src/server/paypal/offer-discovery.ts`:
  - Replaced single fixed `750ms` retry with `computeBackoffDelayMs` (base `500ms`,
    cap `2000ms`, up to `2` primary `503` retries with equal jitter and minimum
    `8000ms` remaining attempt guard) while keeping `GeminiModel` at
    `maxAttempts: 1` (single retry/fallback controller inside `55s` shared
    deadline / `32s` `offer_analysis` stage limit / `12s` payment reserve).
  - Added configurable `GEMINI_COLLECTOR_FALLBACK_MODEL` via `resolveFallbackCollectorModel`
    (public research defaults to `gemini-3.5-flash-lite` when unset, `"off"`/`"none"`
    disables, non-`gemini-3*` rejected with `DISCOVERY_MODEL_UNSUPPORTED`; local/Judge
    mode leaves fallback disabled unless configured). Reserves `8000ms` fallback
    headroom when stage budget `>= 22000ms`, failing over only on recoverable errors
    (`503`, `429`, `500`/`502`/`504`/`408`, `MODEL_TIMEOUT`, `MODEL_TRANSPORT_ERROR`),
    never on `401`/`403`, `400`/`404`, `SAFETY_BLOCK`, `INVALID_MODEL_RESPONSE`,
    `DISCOVERY_REPORT_REQUIRED`, or policy rejections.
  - Extended `createDiscoveryBoundary` with single-use `allowFallbackCollector()`
    preserving the exact `reportDiscoveredOffers` schema, headers, and serialized
    collector payload; records active `usedCollectorModel` in `evidence.collectorModel`.
  - Refined `buildOfferSearchQuery`, `offerSourcePriority`, `classifySearchSourceCategory`,
    and `selectTargetMerchantDomain` to prefer official merchant pricing pages (`pricing`)
    and API/billing docs (`docs`) over blogs, forums, and roundup comparisons.
  - Passed sanitized `PartialComparisonContext` (`sources`, `results`, `retrievedAt`)
    into `runStage`'s `onFailure` hook.
- `web/src/server/paypal/public-research.ts`: Added safe `onComparisonRetry` and
  `onComparisonFallback` metadata logging (no prompts/secrets), kept visitor quota
  refund strictly on terminal `offer_analysis` HTTP `503`, and preserved sanitized
  `results` + `retrievedAt` inside `incompleteComparison` for comparison timeouts,
  `503`, `500`/`502`/`transport`, and `invalid_response` (preserving `429 -> 502`
  and `401/403 -> 502`).
- `web/src/components/purchasing-chat.tsx`, `web/src/components/offer-discovery.tsx`,
  `web/src/app/norway.css`: Client-validated optional `results`/`retrievedAt`
  via `safeExternalOfferUrl`, rendered categorized unverified excerpts clearly
  separated from an explicit `What remains unknown` `<section>` with zero approval
  or payment controls.
- `.env.example`, `web/.env.example`: Documented optional `# GEMINI_COLLECTOR_FALLBACK_MODEL=gemini-3.5-flash-lite`.
- `web/test/offer-discovery.test.ts`: Updated existing `incompleteComparison` /
  `503` / `504` / search-query assertions; added regression tests for
  `computeBackoffDelayMs`, multi-503 recovery, `GEMINI_COLLECTOR_FALLBACK_MODEL`
  recoverable failover & boundary guards, non-recoverable fail-closed handling,
  Tavily relevance ranking, and `IncompleteOfferComparison` markup.

Verification in `.tools/task09-quota` (Node `22`, offline fixtures only, after final edits):

- Prettier `--check` on all 7 modified code/test files: passed.
- Biome lint `--vcs-enabled=false --error-on-warnings` on all 7 modified files:
  0 errors, 0 warnings. (`npm run lint` from `.tools` skips `.` via parent VCS ignore.)
- `npm run typecheck` (`@flint/agent` build + `@flint/agent`/`@flint/web`/`api/src`
  `tsc --noEmit`): passed.
- `npm run build --workspace @flint/web` (`VERCEL=1`, `EARMARK_PUBLIC_DEMO_ONLY=true`,
  all live switches `"false"`): passed (16 static + dynamic routes built).
- Focused `@flint/agent` Vitest (`8` files: `gemini`, `gemini-response`, `gemini-body`,
  `gemini-read-only`, `models`, `policy`, `config`, `testnet`): `150/150` passed, 0 skipped.
- Focused `@flint/web` Vitest (`15` files: `offer-discovery`, `judge-sandbox`,
  `paypal-gemini-agent`, `paypal-gemini-boundary`, `paypal-policy`, `paypal-oauth`,
  `paypal-webhooks`, `paypal-test-auth`, `paypal-postgres`, `paypal-us-migration`,
  `paypal-agent-recovery`, `paypal-agent-campaign05c`, `paypal-config`, `hosted`,
  `theme-console`): `292/292` passed (including `84/84` in `offer-discovery.test.ts`),
  0 skipped.
- Full `npm test` run also executed: `@flint/contracts` failed (missing pinned Forge
  in `.tools/task09-quota`), and legacy EVM `abi.test.ts` (`2` failed),
  `service.test.ts`, `agent/integration.test.ts`, and `agent/security-demo.test.ts`
  failed/skipped due to missing `TaskVault.json` / `ANVIL_START_FAILED`;
  `paypal-sandbox.integration.test.ts` skipped as configured. All other suites passed.
- `node scripts/preview-smoke.mjs`: passed all 8 PayPal pages, legacy denials,
  both themes, 5 viewports (`375`–`1440px`), offline research + incomplete comparison
  overflow/safety checks, zero browser exceptions or external requests.
- `.next/static` static bundle scan for server secret/config identifiers: passed (`0` matches).

Unverified / pending:

- No live Gemini or Tavily API calls, no PayPal calls, no DB mutations, and no
  `git add`/commit/push or Vercel deployment occurred.
- Live Production reliability requires reviewing `.tools/task09-quota` diff,
  publishing to `main` (and optionally setting `GEMINI_COLLECTOR_FALLBACK_MODEL`
  on Vercel Production if overriding the `gemini-3.5-flash-lite` default), and
  running a single authorized Production check.

### 2026-11-13 — Fix official merchant pricing discovery (`.tools/task09-quota`)

Request: Investigate why Earmark identified `Alibaba Model Studio Qwen3.8 Flash`
but missed/rejected its official pricing page
`https://www.alibabacloud.com/help/en/model-studio/model-pricing`, and implement
a general-purpose fix prioritizing first-party pricing docs, distinguishing fixed
subscriptions vs prepaid credits vs usage-based token rates, adding deadline-safe
official-domain pricing search, and preserving research-only pricing links
without PayPal/checkout fabrication.

Root causes identified in `web/src/server/paypal/offer-discovery.ts` and
`web/src/components/offer-discovery.tsx`:

- `PRICING_PATH_RE` (`\/(?:pricing|plans|packages|tiers|subscriptions|billing)\b`)
  and `merchantPlanSources` missed hyphenated official pricing slugs such as
  `/help/en/model-studio/model-pricing` and `/docs/api-pricing`, downgrading
  them below `/pricing` paths and suppressing `officialMerchantUrl`.
- `offerMerchantDomain` checked only `provider === domainLabel` (`alibabamodelstudio`
  !== `alibabacloud`) and inspected only `citedUrls`.
- `discoverOffers` ran no secondary official-domain pricing search when an
  identified offer returned with unverified pricing and no official pricing page.
- `billingPeriod` / `priceEvidence` / `parseTierTable` accepted only fixed
  `"month" | "year" | "one-time"` plans with 2-decimal `priceMinor` cents,
  ignoring `| Model |` tables and sub-cent per-million-token usage pricing or
  prepaid credits.

Files modified in `.tools/task09-quota`:

- `web/src/lib/offer-discovery.ts`: Added `OfferBillingModel`,
  `OfferUnitPrice`, `VerifiedOfferPricingDetails`, optional `pricingDetails` on
  `DiscoveredOffer`, `searchRequests?: 1 | 2 | 3`, and fallback support for
  `pricingDetails?.sourceUrl` in `selectVerifiedOfferSourceUrl`.
- `web/src/server/paypal/offer-discovery.ts`: Added `isOfficialPricingPath`,
  `matchesMerchantDomain`, `lookupMerchantDomain`, `hasOfficialPricingDocument`,
  `buildTargetedPricingQuery`, `pricing_search` stage (`publicStageLimits`,
  `PAYMENT_EVIDENCE_RESERVE_MS` + `MIN_PRICING_SEARCH_MS` deadline guard),
  `allowPricingSearch` / `allowPricingResults` in `createDiscoveryBoundary`,
  token-rate exclusion in fixed `priceEvidence`, and server-side
  `verifyUsageOrCreditPricing` extracting verified model name, region, explicit
  currency (no bare-`$` inference), unit prices, billing model, and billing
  terms from official tables and prose while keeping `pricing.period = null`,
  `officialCheckoutUrl = null`, `paypal = "unknown"`, and `policy.eligible = false`.
- `web/src/server/paypal/public-research.ts`: Mapped `pricing_search` in
  `stageTimeouts` to `PUBLIC_RESEARCH_SEARCH_TIMEOUT`.
- `web/src/components/offer-discovery.tsx`: Updated `OfferDiscovery` and
  assisted manual checkout cards to display verified usage-based / prepaid-credit
  unit prices, billing model, terms, model name, region, and official pricing
  documentation research links distinctly from checkout/monthly plans.
- `web/test/offer-discovery.test.ts`: Added 3 offline regression tests covering
  direct Alibaba Cloud Model Studio `Qwen3.8 Flash` (`model-pricing`), missed
  initial search recovery + deadline/boundary checks, and an unrelated API
  merchant (`NovaML API` `Echo-7B` usage pricing vs `Starter Credit Pack`
  prepaid credits).
- `HANDOFF-PAYPAL.md`: Logged root cause, changes, and verification results.

Verification in `.tools/task09-quota` (Node `22`, offline fixtures only, after code edits):

- Prettier `--check` on all 5 modified code/test files: passed.
- Biome lint `--vcs-enabled=false --error-on-warnings` on all 5 modified files:
  0 errors, 0 warnings.
- `npm run typecheck`: passed.
- `npm run build --workspace @flint/web` (`VERCEL=1`): passed (`16` static +
  dynamic routes compiled).
- `node scripts/check-web-boundary.mjs`: passed (`48` compiled JS chunks).
- Focused Vitest (`offer-discovery` `87/87`, `judge-sandbox` `19/19`,
  `paypal-gemini-agent` `16/16`, `paypal-gemini-boundary` `20/20`): `142/142`
  passed, `0` failed, `0` skipped.

Unverified / pending:

- No live Tavily/Gemini/PayPal calls, no database changes, and no new commit,
  push, or Vercel deployment occurred. Root checkout remains untouched.

### 2026-11-14 — Fix official provider discovery (`.tools/task09-quota`)

Request: Address production regression where broad queries such as
`"Find $20 Chinese AI model plans"` returned `"No sufficiently structured offer
evidence was returned."` when Gemini returned zero structured offers or
incomplete pricing evidence. Make official vendor and pricing-documentation link
discovery a general-purpose first-class step independent of Gemini pricing
extraction, exclude third-party listicles/aggregators, guard against spoofed
domains, keep research links distinct from checkout, recognize usage-based and
prepaid credits within a budget, preserve existing safety/quota boundaries, run
offline verification checks, and update this handoff.

Root causes identified in `web/src/server/paypal/offer-discovery.ts` and
`web/src/components/offer-discovery.tsx`:

- `buildOfferSearchQuery` biased Tavily results toward `"named tiers, currency,
and billing periods"` without `exclude_domains`, causing aggregator blogs and
  comparison directories to crowd out official vendor usage/prepaid credit docs.
- `discoverOffers` ran targeted follow-up search only after Gemini (`offers`)
  already returned an offer; when Gemini returned `offers: []` or missed
  vendors, zero official provider websites survived into `OfferDiscoveryResult`
  and `OfferDiscovery` showed `"No sufficiently structured offer evidence was
returned."`.
- `PREPAID_CREDIT_RE` did not match common credit top-up phrasing such as
  `top-ups` or `credit balances`.

Files modified in `.tools/task09-quota`:

- `web/src/lib/offer-discovery.ts`: Added `DiscoveredOfficialProvider` (with
  literal `checkoutUrl: null`), optional `officialProviders` on
  `OfferDiscoveryResult`, and widened `evidence.searchRequests` to `1 | 2 | 3 | 4`.
- `web/src/server/paypal/offer-discovery.ts`: Added `TAVILY_EXCLUDED_DOMAINS`,
  `buildExcludedDomains`, updated `buildOfferSearchQuery`, added
  `buildOfficialProviderDiscoveryQuery`, `isSpoofedOrThirdPartyProvider`,
  `collectThirdPartyHostnames`, `extractOfficialProviders`,
  `reconcileOfficialProviders`, `rankOfficialFirstDiverse`, and shared
  `assertUntrustedResultsSafe`; widened `PREPAID_CREDIT_RE`; added
  `provider_search` (`publicStageLimits`, `MIN_PROVIDER_SEARCH_MS`,
  `allowProviderSearch` / `allowProviderResults` / `clearProviderSearch`) in
  `createDiscoveryBoundary` and `discoverOffers` (before Gemini and within the
  shared deadline); preserved verified `officialProviders` even when `offers` is
  `[]` or price validation fails.
- `web/src/server/paypal/public-research.ts`: Mapped `provider_search` in
  `stageTimeouts` to `PUBLIC_RESEARCH_SEARCH_TIMEOUT`.
- `web/src/components/offer-discovery.tsx` & `web/src/app/norway.css`: Added
  `"Verified official providers"` research card rendering in `OfferDiscovery`
  (client-side re-validated with `safeExternalOfferUrl`, marked as research link
  only rather than checkout, with explicit `Price: Unknown` / `PayPal: unknown`
  states and suppression of the empty-evidence fallback when verified official
  providers exist).
- `web/test/offer-discovery.test.ts`: Re-aligned initial Tavily search body check
  and blog-only call count expectation (`4` calls with pre-Gemini
  `provider_search`), added `exclude_domains` mutation guard check, and added
  regression tests for empty Gemini `offers: []` multi-provider discovery
  (`DeepSeek`, `Alibaba Cloud`, `Zhipu AI`), non-AI cross-industry discovery
  (`Resend`, `Postmark`, `Mailjet`), price-validation failure survival, spoofed /
  aggregator / checkout-path rejection, and `provider_search` boundary enforcement.
- `HANDOFF-PAYPAL.md`: Documented root causes, changes, and verification results.

Verification in `.tools/task09-quota` (Node `22`, offline fixtures only, after code edits):

- Prettier `--write` + Biome check `--vcs-enabled=false --error-on-warnings` on
  all modified code/test files: `0` errors, `0` warnings.
- `npm run typecheck`: passed across workspaces and `api/src/tsconfig.json`.
- `VERCEL=1 npm run build --workspace @flint/web`: passed (`16/16` static routes
  - dynamic routes compiled).
- `node scripts/check-web-boundary.mjs`: passed (`48` compiled JS chunks checked).
- Focused Vitest (`offer-discovery` `90/90`, `judge-sandbox` `19/19`,
  `paypal-gemini-agent` `16/16`, `paypal-gemini-boundary` `20/20`, `hosted`
  `8/8`): `5/5` files, `153/153` tests passed, `0` failed, `0` skipped.

Unverified / pending:

- No live Tavily, Gemini, or PayPal calls, no database mutations, and no commit,
  push, or Vercel deployment occurred. Root checkout remains untouched.

### 2026-11-15 — Official provider identity and relevance regression (Cloud)

Worked in `/workspace/earmark-paypal`, starting from a clean clone of
`aveidt96/earmark-paypal` `main` at `6182306`. No earlier checkout was mounted.

Confirmed defect: `extractOfficialProviders` promoted every safe URL that escaped
its negative blog/spoof filter; `instruction` did not establish product relevance.
Brand checks accepted arbitrary substring/five-character prefixes, and collector
citations could contribute third-party prices. Norway trusted that provider list
and printed raw snippets. Earlier survival tests did not establish correct identity.

Changed paths:

- `web/src/server/paypal/offer-discovery.ts`: Positive title/canonical-domain
  association, explicit reseller/editorial/unverified/irrelevant classification,
  request subject matching, and original-model/API and company-origin evidence
  for Chinese model requests. Canonical brand aliases require retrieved evidence;
  arbitrary prefixes and appended generic API/pricing words do not prove identity.
  Reuses existing ranking and deadline-gated provider search; applies the same
  gate to Gemini offers and pricing citations. Keeps independently discovered
  links separate from price extraction and prevents unrelated citation status
  transfer. No provider roster or new search stage.
- `web/src/lib/offer-discovery.ts`, `web/src/components/offer-discovery.tsx`:
  Optional provider service label, concise plain-text excerpts (two sentences,
  240 characters; tables omitted), explicit billing/unknown prices and payments,
  visible official research links and clear no-suitable-provider state. Existing
  independently verified checkout-link restrictions remain.
- `web/test/official-provider-regression.test.ts` (new),
  `web/test/offer-discovery.test.ts`: Exact reported domains, poisoned collector
  output, empty Gemini offers, ownership/origin/language distinctions, domain
  spoofing, blog-price contamination, UI and transactional-email regressions.
  Replaced identity-free fixtures and expectations that displayed uncited/blog
  offers with explicit first-party evidence or rejection assertions.
- `HANDOFF-PAYPAL.md`: Updated current state and this record.

Constructed offline fixtures (not captured live responses): accepted
`https://api-docs.deepseek.com/quick_start/pricing`,
`https://www.alibabacloud.com/help/en/model-studio/model-pricing`, and
`https://open.bigmodel.cn/pricing` with explicit ownership/origin evidence despite
`offers: []`. Rejected `https://aicodewith.ai/`, `https://glbgpt.com/`,
`https://toolgrowthhq.com/`, unrelated OpenAI/credit plans, spoof domains and
`https://glbgpt.com/blog/deepseek-pricing` as pricing evidence. Email fixtures
accepted `https://resend.com/pricing`, `https://postmarkapp.com/pricing` and
`https://dev.mailjet.com/email/guides/billing`; AI plans, reviews and resellers
were rejected for that category. Novel synthetic brands also pass with evidence.

Fresh final checks (Node 22.14.0; locked dependencies, no dependency changes):

- 16 focused web/security files: **312/312 passed**, including 104 discovery tests.
- Eight focused agent/security files: **150/150 passed**, zero skips.
- Root `npm run typecheck`, root `npm run lint` (including pinned Forge fmt),
  changed-code Prettier check and `git diff --check`: passed. Biome reported only
  pre-existing informational suggestions; changed files had no warnings/errors.
- Public production web build: passed; all provider/payment switches disabled.
- Browser boundary: **46 chunks passed**; source PEM/Google/GitHub credential
  pattern scan returned no matches. No real credentials were available to scan.
- Existing offline production browser smoke, using installed Chromium: passed
  eight pages, both themes and five viewports; zero external requests, browser
  exceptions, legacy API requests or wallet probes.

Initial root lint lacked the existing pinned Forge; installed it using the
repository's checksum-verified setup. Four mocked hosted HTTP tests timed out
under network isolation and Next's TypeScript subprocess produced empty config
output under process isolation; both passed outside that isolation. No application
changes were made to bypass those checks. Full legacy EVM/DB integration suites
were not run; focused PostgreSQL tests use offline doubles.

Limits / next step: classification uses bounded retrieved evidence, not an
ownership registry or live page inspection. Sparse titles, domain aliases,
non-English text or absent company-origin evidence can suppress genuine providers;
unknown evidence fails closed. No live Tavily/Gemini/PayPal calls, payment
operations, database changes, commits, pushes or deployments occurred. Quotas,
deadlines, privacy/outbound guards and PayPal checkout are unchanged. A separately
authorized post-deployment live check of the exact Chinese-model query and an
unrelated category is required before claiming production relevance is fixed.

### 2026-11-15 — Prepare verified research-accuracy fix for draft PR review

User explicitly authorized branch creation, commit, push and a draft PR targeting
`main`, without merge, deployment, live provider calls or financial operations.
Fetched `origin/main`: `6182306161f2ffc4f015a79efd2703f359eb89cc`, identical to the
verified implementation baseline (zero commits of divergence). Created
`fix/official-provider-verification` from that baseline, preserving all existing
research improvements and unrelated main work without rebase or merge.

The intended review payload is exactly `HANDOFF-PAYPAL.md`,
`web/src/server/paypal/offer-discovery.ts`, `web/src/lib/offer-discovery.ts`,
`web/src/components/offer-discovery.tsx`, `web/test/offer-discovery.test.ts` and
`web/test/official-provider-regression.test.ts`. Application and test contents
remain the previously verified implementation; only this handoff record and its
current-state summary were added during publication preparation. The commit
message is `fix: validate provider identity and search relevance`.

Retained verification artifacts confirm 312/312 focused web/security tests and
150/150 agent tests, with no failures or skips; prior typecheck, root lint,
production build, browser smoke and boundary results remain applicable because
no implementation changed. Fresh publication checks passed: six-file scope,
whitespace, changed-code formatting and zero credential-pattern matches. PR description
must distinguish constructed offline fixtures from live evidence and document
conservative rejection when identity/product/origin evidence is sparse.

Next step is human draft-PR review. Production relevance still requires a
separately authorized deployment and live retest. No payment backend, checkout,
quota/deadline/privacy guard or financial database change is included.

### 2026-11-15 — Final review of draft PR #3 (`c70f37f`)

Confirmed four defects in the submitted diff: product-only titles could fail the
exact corporate-domain check; own-page ownership/origin statements were mandatory
in short snippets; every request keyword was required (and `that`/`with` could
truncate the actual product); fabricated own-page company/model/origin claims
could nevertheless pass as official. Earlier passing fixtures did not prove
independent identity verification. These findings supersede that assurance.

Narrow corrections on the existing `fix/official-provider-verification` branch:

- `web/src/server/paypal/offer-discovery.ts`: Separate plausible candidates from
  corroborated first-party sources. A verified association requires an explicitly
  labeled official HTTPS host in a separately retrieved Wikipedia/Wikidata article
  excerpt, with model ownership and requested Chinese company origin supported
  there. Exact safe host/subdomain association supports corporate/product aliases;
  candidates' self-assertions, arbitrary publishers, spoof hosts and user pages
  do not establish identity. Wikipedia is now eligible as identity context, while
  both reference publishers remain excluded as merchants. Reuse the existing
  searches and bounds; no embedded reference URL is fetched. Missing identity
  evidence retains relevant links as unverified. Match page-specific topic terms,
  polite phrasing, email/SMTP aliases and comparison alternatives; recognize sparse
  input/output token-rate snippets. Another corporate product cannot supply
  relevance. Uncorroborated offers cannot be recommended or expose official
  merchant/checkout URLs.
- `web/src/lib/offer-discovery.ts`, `web/src/components/offer-discovery.tsx`:
  Optional candidate/identity provenance fields, visibly separate unverified
  research cards, linked corroboration and source-claim labeling. No raw snippets
  or payment authority added; actual PayPal checkout/backend remain untouched.
- `web/test/official-provider-regression.test.ts`,
  `web/test/offer-discovery.test.ts`: Sparse Qwen/Alibaba Cloud, GLM/Zhipu and novel
  corporate aliases; empty Gemini retention; fabricated claims/reference spoofing;
  same-company unrelated-product rejection; natural email/weather/storage requests;
  uncorroborated checkout/recommendation denial. Positive checkout fixtures now
  provide independent identity evidence. All fixtures are constructed offline.
- `HANDOFF-PAYPAL.md`: Record this review, corrections and external blockers.

Fresh validation: **323/323** focused web/security tests (including **115**
discovery tests), **150/150** agent tests, zero failures/skips. Root lint (including
pinned Forge), typecheck, public production build, changed-code Prettier and
whitespace checks passed. Browser boundary passed **46** chunks. Existing offline
browser smoke passed eight pages, both themes and five viewports; focused new-card
browser checks passed at 375px/1440px with safe links, no checkout or overflow,
zero external requests and zero browser errors. All provider/payment execution
switches were disabled; PostgreSQL checks used doubles, not a live database.

Vercel evidence: GitHub combined statuses for `c70f37f` report failures for both
`earmark-paypal` and `earmark-paypal-i2bk`; the bot table marks both `BLOCKED`.
[The bot explanation](https://github.com/aveidt96/earmark-paypal/pull/3#issuecomment-6887532978)
says commit author `samuel0604-byte` is not a member of `samuelid22's projects`.
This establishes an account/team-access gate, not a demonstrated compiler failure.
No hosted build execution or build logs are established by the available evidence.
No account access, authorship, visibility, deployment or CI configuration changed.

Limits: corroboration is bounded retrieved public-reference evidence, not
universal ownership authentication. Missing/malformed reference statements and
unrecognized language/topic synonyms can leave genuine sources unverified or
missed. Geographic fit is explicitly unknown without corroborating origin data.
Controlled deployment review must assess this trust/recall tradeoff; actual
execution is blocked on owner resolution of Vercel membership/GitHub connection.
Live relevance still needs a separately authorized post-deployment check. Quotas,
deadlines, privacy/outbound guards, unrelated main work and financial restrictions
are preserved. Only a normal update of the existing PR branch is authorized;
no merge, deployment, live provider API calls, payment or financial DB operations.

### 2026-11-15 — Purchasing relevance across collector and incomplete fallback

Request: diagnose the Production `Find me $20 Chinese model API plans` failure
at approximately 06:43 UTC (07:43 Africa/Lagos). Fetched `origin/main` and based
local branch `fix/research-fallback-relevance` on merge `7457b75`; no commits,
pushes, merges or deployments performed during this task.

Confirmed code defects: ranking deprioritized unrelated Tavily results but still
filled the five collector slots with them; the same results became partial
comparison context. The fallback rendered safe URLs/excerpts without checking
the purchasing instruction, even creating cards from URL-only data. Provider
identity classification did not protect that path. The initial query also mixed
the budget with broad generic terms. Reconstructed from the reviewed baseline
(not a captured Production request), the initial query was:

```text
Find me $20 Chinese model API plans original product provider official website API pricing documentation prepaid credits pay-as-you-go plans
```

It is now `Chinese model API plans official provider pricing documentation`.
The existing provider-search query is now
`Chinese model API plans original developer provider official website company ownership country product documentation pricing`;
previously it used the entire original instruction as that suffix's prefix.
The original instruction and budget still reach the trusted collector task and
policy checks intact. No search stage or dependency was added.

Affected paths:

- `web/src/lib/research-relevance.ts` (new): share the existing normalized topic
  and alternative matching, with page-specific product/purchasing evidence and
  editorial financial-news rejection. This gate never verifies provider identity,
  origin, pricing, payment or checkout.
- `web/src/server/paypal/offer-discovery.ts`: reuse that gate in classification;
  filter before collector truncation, preserve validated identity context, stop
  with `DISCOVERY_RELEVANT_SOURCES_REQUIRED` if none qualify, and remove monetary
  noise from the existing search queries. Independently verified exact-tier
  checkout lookup can still use validated seed pages without supplying unrelated
  topic evidence to Gemini. PayPal checkout code is untouched.
- `web/src/server/paypal/public-research.ts`,
  `web/src/lib/offer-discovery.ts`: bind partial context to the trusted original
  instruction, recheck relevance, derive URLs from relevant metadata, accept an
  empty preserved set, and map the no-relevant-evidence error clearly.
- `web/src/components/purchasing-chat.tsx`,
  `web/src/components/offer-discovery.tsx`: recheck fallback metadata against the
  actual submitted instruction, fail closed on URL-only/missing-context data,
  preserve concise relevant excerpts, and show a short failure message when empty.
- `web/test/research-relevance.test.ts` (new),
  `web/test/offer-discovery.test.ts`,
  `web/test/official-provider-regression.test.ts`: 13 new regressions covering the
  screenshot's shattered.io funding page, Samsung promotion and Finder treasury
  article; transactional email and weather API purchasing; collector input/query
  filtering; trusted budget preservation; no Gemini call on irrelevant-only
  searches; fallback defense; independently corroborated official-doc retention
  through a collector failure. Finder's full path/body are constructed fixtures,
  not captured Production evidence. Existing deadline, checkout, identity and
  privacy/security assertions remain; fixtures now name relevant services.
- `scripts/preview-smoke.mjs`: mock mixed relevant/irrelevant fallback results and
  a wrong response instruction, then submit the exact reported query with only
  unwanted results. Assert relevant-only links and the empty failure state.
- `HANDOFF-PAYPAL.md`: record the diagnosis, changes, validation and remaining
  runtime-access limitation; preserve historical entries.

Fresh checks: **336/336** focused web/security tests across 17 files (including
**128** discovery/relevance tests); **150/150** agent tests across eight files;
zero failed/skipped tests. Root lint (including pinned Forge), typecheck, public
production build, changed-code Prettier and whitespace checks passed. Typecheck
initially found a missing fixture `retrievedAt`; corrected it, then typecheck and
the 13 new tests passed. Browser boundary: **46** compiled chunks, zero forbidden
credential/private-key/local-path markers. Changed-code credential-signature scan:
zero matches. Offline Chromium smoke: eight pages, both themes, five viewport
widths, relevant-only/empty fallback checks, zero browser exceptions or external
requests. All provider responses were mocked and payment/provider execution flags
disabled; quota/PostgreSQL behavior used doubles, with no financial DB operations.
Whole-handoff Prettier still reports three pre-existing historical formatting
differences (also confirmed in `HEAD`); new documentation blocks need no formatting
changes. Historical prose was left intact.

Runtime diagnosis remains limited: read-only GitHub deployments lookup and the
Vercel project API returned HTTP 403; no Vercel CLI/token/auth session or connector
was available. Requested sanitized logs for 06:40–06:46 UTC; none received. In the
reviewed revision, the screenshot's incomplete/unavailable wording is emitted
only for a recoverable `offer_analysis` failure with preserved comparison context.
It can follow an invalid model response (including HTTP 200), transport failure,
503 or another recoverable upstream status. It does not establish a Gemini
outage, actual HTTP/error code, model or elapsed/timeout value. Code defaults are
`GEMINI_COLLECTOR_MODEL ?? GEMINI_MODEL ?? gemini-3.8-flash`, public fallback
`gemini-3.5-flash-lite`, with a 55s request deadline, 32s comparison cap and 12s
payment-evidence reserve; these are configured code limits, not observed live
measurements. Production's deployed SHA and environment were not confirmed.

Limits/next steps: lexical relevance remains conservative and depends on retrieved
metadata; missing product context/synonyms can exclude valid pages. Independent
provider identity checks, privacy/outbound guards, quotas/refund rules, deadlines
and payment restrictions remain. Obtain sanitized runtime entries to identify
the actual failed stage/model/code/timing, then perform a separately authorized
post-deployment live retest of the exact query and other purchasing categories.
Passing offline tests does not establish Production accuracy.

### 2026-11-15 — Recheck repeated failure report and additional screenshots

Fetched `origin/main` again: it remains `7457b75`. Existing local implementation
and regressions above remain intact on `fix/research-fallback-relevance`; no
additional application, test or configuration edits were justified by the
repeated report. `HANDOFF-PAYPAL.md` is the only further file changed in this
recheck. The added screenshots show the earlier official-provider label problem
with evidence timestamp `2026-11-15T00:55:37.592Z`, distinct from the reported
06:43 UTC incomplete-comparison failure. The merged independent-identity tests
cover the earlier sources; the local fallback fix covers the later path.

Rechecked diagnostic access: GitHub deployments and Vercel project APIs still
return HTTP 403; no Vercel CLI, token or local auth file is available. No
Production runtime records or deployed SHA were obtained. The actual live
collector model/error/status/timing therefore remain unknown.

Fresh repeated validation: expanded offline web/security selection reports
497 passes, four loopback HTTP test timeouts in the restricted sandbox, and
21 intentionally skipped live database/Sandbox tests. All eight hosted HTTP
security tests subsequently pass with loopback access, resolving those four
failures without source changes: **501 distinct passing offline web tests**,
including **128 discovery/relevance tests**. Agent checks: **150/150 pass**.
Root lint (170 existing informational suggestions), typecheck, changed-code
formatting and whitespace checks pass. The restricted-sandbox build initially
failed parsing empty TypeScript `--showConfig` output; the identical production
build succeeds with subprocess access. Browser boundary passes **46** chunks;
added-content credential-signature scan has zero matches. Live-test opt-ins
remained false and no provider, database or payment operations were performed.
Repeated offline Chromium smoke also passes eight pages, both themes and five
viewport widths, including relevant-only and empty fallback behavior, with zero
browser exceptions or external requests.
The prior whole-handoff formatting limitation remains. Production logs and an
authorized post-deployment live retest are still required; no commit, push,
merge, deployment or Vercel setting change occurred.

### 2026-11-15 — Publish research relevance fix for draft review

User authorized a normal push and draft PR targeting `main`, without merge,
deployment, live provider calls or financial operations. Fetched `origin/main`
again and verified baseline `7457b75ab580299c1932946bb35af46cdd29b7b0` is unchanged.
Created `fix/research-relevance-fallback` from that exact baseline, preserving the
existing work and other branches. Verified the connected GitHub account is
`aveidt96` (ID `189458132`) and repository-local author/committer identity is
`aveidt96 <189458132+aveidt96@users.noreply.github.com>`.

Only the already reviewed relevance/fallback change is included: shared helper
and types in `web/src/lib/research-relevance.ts` and
`web/src/lib/offer-discovery.ts`; handlers in
`web/src/server/paypal/offer-discovery.ts` and
`web/src/server/paypal/public-research.ts`; UI in
`web/src/components/offer-discovery.tsx` and
`web/src/components/purchasing-chat.tsx`; regressions in
`web/test/research-relevance.test.ts`, `web/test/offer-discovery.test.ts` and
`web/test/official-provider-regression.test.ts`; browser fixtures in
`scripts/preview-smoke.mjs`; and this publication record in `HANDOFF-PAYPAL.md`.
No additional application implementation, checkout handler, dependency,
credential, database or deployment-configuration changes were made.

Publication review confirms the exact intended 11-file set, clean whitespace and
zero added-content credential signatures. Existing validation artifacts confirm
501 distinct offline web/security passes (four restricted-sandbox loopback
timeouts resolved by the eight-test hosted rerun), 21 intentionally skipped live
integration tests, 150 agent passes, lint/typecheck/build/changed-code formatting,
46-chunk browser boundary and offline Chromium smoke. No application changes
since those checks warrant repeating them. The PR description records the
confirmed ranking/fallback defects, reconstructed query, checks and limitations.
Production runtime logs remain unavailable from the earlier 403 attempts; the
actual live collector model/error/status/timeout remain unknown. Publication
results and GitHub checks are verified externally after the normal push and
recorded in the PR/final report. Live relevance requires a separately authorized
post-deployment retest; draft publication does not establish Production accuracy.

### 2026-11-15 — Draft PR #4 publication verification and handoff formatting

Normal push published application commit
`311e0eacd0c3a6d694cce479a10bf7b317844f14` on
`fix/research-relevance-fallback`; [PR #4](https://github.com/aveidt96/earmark-paypal/pull/4)
is open as a draft targeting `main`. GitHub verifies both author and committer
are `aveidt96` (ID `189458132`); the commit metadata uses the requested noreply
address. Remote `main` remains `7457b75`, and the reviewed tree matches the
published application commit exactly. The working tree was clean after commit.

Initial GitHub Actions Ubuntu verification passed installation, high-severity
dependency audit and pinned Forge setup, then stopped at the whole-repository
Prettier check solely for `HANDOFF-PAYPAL.md`. Its three historical formatting
differences were already recorded above. This follow-up changes only
`HANDOFF-PAYPAL.md`: normalize those formatting differences, update publication
state and record the observed CI outcome. Historical results are preserved;
application/test/configuration files remain identical to `311e0ea`.

Follow-up handoff Prettier and whitespace checks pass. Only a
normal follow-up push is authorized; no amend or force-push. Both Vercel automatic
branch checks were building at the first inspection, with Windows CI still
running. Final checks are inspected on the new head and reported in the PR/final
report. No Production deployment, provider/API research, payment or financial
database operation was performed.

### 2026-11-15 — User-authorized publication of PR #4 to main

The user explicitly requested pushing the research relevance fix to `main`
because Preview cannot be tested adequately. This supersedes the earlier
draft-only/no-merge restriction for PR #4 and authorizes the existing automatic
Vercel Production release triggered by updating `main`. It does not authorize
live provider research calls, payment or financial database operations, or
changes to Vercel configuration.

Before publication, verify the clean PR branch at `ed15e16` against freshly
fetched `main` (`7457b75`). GitHub CI run `43708316243` completed successfully on
both Ubuntu and Windows, including the complete `npm run check` pipeline,
dependency audit and pinned Forge setup. Primary `Vercel – earmark-paypal` passed;
secondary `Vercel – earmark-paypal-i2bk` failed without an exposed underlying
reason. Do not claim the secondary check passed or infer its failure category.

Only `HANDOFF-PAYPAL.md` changes in this authorization record. Application/test/
configuration content remains identical to the tested `ed15e16` tree. Check its
formatting and whitespace, commit with the verified aveidt96 identity and push
normally to the PR branch, then mark PR #4 ready and merge with an expected-head
SHA check. Preserve unrelated main work; do not force-push or bypass protection.
Final remote main SHA and automatic release status are verified after the merge
and reported to the user. Production availability and the live query's accuracy
must be verified separately; offline/CI success alone does not establish either.

### 2026-11-18 — Find official AI model plans by developer country

The user wants `Find me $20 Chinese ai model plans` to surface links such as
DeepSeek, Qwen and Kimi, and `Find me $20 us ai model plans` to surface links such
as OpenAI, Google and Anthropic. Fetched `origin/main` at `ab19c8a` (merged PR #4)
and created `fix/regional-model-provider-discovery` from that commit. The earlier
release's GitHub statuses showed primary `earmark-paypal` success and secondary
`earmark-paypal-i2bk` failure, with no live research verification.

Before this change, origin verification was China-specific, `us` acted like a
topic word, and the model relevance gate required API evidence for consumer
subscriptions. Also, plausible candidates could suppress the only available
follow-up search even when none had independent ownership evidence.

- `web/src/lib/research-relevance.ts` recognizes China and US country modifiers
  for AI model research and separates country from product relevance. Explicit
  API requests still require API evidence. General model-plan requests can
  accept first-party chatbot subscriptions and API pricing, while generic model
  names on phone or other unrelated pricing pages are insufficient.
- `web/src/server/paypal/offer-discovery.ts` directs the existing follow-up
  search toward independent ownership evidence for discovered candidate domains
  when verified coverage is sparse. Country, model ownership and official host
  must be corroborated for regional requests. Accept labelled reference links
  in common Markdown/infobox formats while preserving safe exact-host or
  subdomain checks. Exclude other countries, resellers and unverified candidates
  from regional collector/fallback evidence. Restrict regional offers to verified
  citations. Return official links when Gemini gives no structured offers, and
  skip the unrelated payment-method search for link-only regional results unless
  PayPal was requested. The price ceiling still uses the original instruction
  and the selected budget. No providers or prices are hardcoded into discovery.
- `web/src/server/paypal/public-research.ts` and
  `web/src/components/purchasing-chat.tsx` report when no official provider can
  be verified for the requested country. No search stage, dependency, checkout,
  authorization, deadline or quota limit was added or changed.
- `web/test/official-provider-regression.test.ts`,
  `web/test/offer-discovery.test.ts` and `web/test/research-relevance.test.ts` cover
  both exact prompts, first-party subscriptions and APIs, wrong-country and
  same-company unrelated products, resellers, empty/malformed collector output,
  and the $20 ceiling for a verified subscription. General research still shows
  separate unverified candidates where applicable. All fixtures are constructed
  evidence, not live search results or current price assertions.
- `HANDOFF-PAYPAL.md` records the local change and verification.

Fresh offline verification: 220 discovery, relevance, policy and provider
boundary tests passed. Repository formatting, lint, typecheck, production web
build and whitespace checks passed. The browser boundary scan passed on 46
chunks and the added-content credential signature scan found zero matches.
Retrieval still depends on the bounded search returning
both relevant provider pages and usable independent references. An official link
with unknown pricing does not establish budget fit. No live provider calls, DB or
payment operations, commit, push, merge or deployment were performed.

### 2026-11-18 — Publish the regional discovery fix to main

The user requested pushing the previously verified regional discovery fix to
`main`. Fetched `origin/main` again and verified that its head and the local
baseline are both `ab19c8a`. The release commit includes the seven code and test
paths listed above and this `HANDOFF-PAYPAL.md` entry. Application and test
content is the same as the 220-test offline run. Check the staged paths,
whitespace, handoff formatting, and credential signatures before committing and
pushing the single commit normally to `main`. Verify the remote SHA and report
the existing Vercel integrations' observed statuses after publication.
Live retrieval for both prompts still requires Production verification.

### 2026-11-18 — Apply verification to purchasing research across categories

The user clarified that the fix should apply to search generally. Fetched latest
`origin/main` at `bf90406` and created local branch `fix/general-provider-search`.
The previous main release's primary Vercel check completed successfully; the
secondary `earmark-paypal-i2bk` check failed. This does not verify live search.

- `web/src/lib/research-geography.ts` adds optional provider-origin parsing from
  explicit country names using `Intl.DisplayNames`, plus common English demonyms
  and abbreviations. Scope applies across products, services and subscriptions.
  Authority excerpts need ownership information such as headquarters or a
  company-origin statement. Currency markers, language requests and marketing
  availability do not establish provider origin.
- `web/src/lib/research-relevance.ts` separates origin from the product being
  matched and accepts shopping and specification evidence for physical goods.
  Model/API requests still use product-specific evidence checks.
- `web/src/server/paypal/offer-discovery.ts` uses product-neutral search wording
  and seeks corroboration through the existing bounded follow-up when ordinary
  searches surface multiple plausible providers without verification. Verified
  providers rank before candidates. Requests scoped to official sources or a
  provider's country show only corroborated results. General results can retain
  explicitly labelled candidates. All cited offers are still evaluated against
  the original budget, evidence and existing payment restrictions. No new
  search stage or dependency was needed.
- `web/src/server/paypal/public-research.ts` and
  `web/src/components/purchasing-chat.tsx` explain when verification yields no
  official provider for either scope without tying the message to AI models.
- `web/test/official-provider-regression.test.ts`,
  `web/test/offer-discovery.test.ts` and `web/test/research-relevance.test.ts`
  cover transactional email, photo backup and solar lanterns across Canada,
  Germany and Kenya, the prior China and US AI queries, official-only requests
  without geography, and ordinary follow-up searches. They also cover rejecting
  wrong-country and unproven providers and distinguishing currency, language and
  service regions from company origin. Existing request-count assertions now
  include the bounded corroboration search where applicable.
- `HANDOFF-PAYPAL.md` records the clarified scope and verification.

225 targeted offline tests passed, covering discovery, provider guards and
policy. An initial run exposed expected request-count changes in older fixtures;
their assertions now verify the additional bounded follow-up. Formatting, lint,
typecheck, the public production web build, whitespace and browser boundary
checks passed. The browser scan covered 46 chunks, and the staged-content-style
credential signature scan found zero matches in the local diff and new file.
Evidence remains bounded by retrieved snippets. Unfamiliar demonyms
may require writing the provider's country name explicitly, and product origin,
availability and budget fit require their own evidence. This change remains
local. No live provider calls, financial operations or release were performed.

### 2026-11-18 — Release the generalized search fix to main

The user requested a push to `main`. Fetched `origin/main` and verified the local
baseline and remote branch both point to `bf90406`. The release includes the
eight application and test paths listed in the preceding entry and this handoff
update. The previously validated code is unchanged. Review the staged path set,
formatting, whitespace and credential signatures before publishing one normal
fast-forward commit. Verify the remote SHA and report the automatic deployment
status separately. Live research and financial operations are outside this release.

### 2026-11-18 — Keep useful plan links when provider verification is incomplete

The user showed `Find a $20 Chinese ai plan` returning the country-verification
error on Production and asked whether Tavily should be replaced. Fetched main at
`ca6251e` and worked locally on `fix/preserve-relevant-provider-links`. GitHub
status confirms the previous primary release passed and its secondary check
failed. The screenshot alone does not reveal what Tavily returned. This workspace
has no Vercel CLI, token, local session or log connector. No raw Production
retrieval trace was available to diagnose search-provider recall.

- `web/src/lib/research-relevance.ts` recognizes `AI plan` and `AI subscription`
  as model-shopping intent and expands those forms in provider searches. The
  collector and budget checks still use the original request.
- `web/src/server/paypal/offer-discovery.ts` preserves plausible matching pricing
  and documentation links after a country-scoped search yields no corroborated
  provider. Retained links need product evidence and brand/host association;
  exclude editorial and reseller pages, checkout-only pages, and providers with
  contradictory country evidence. Links stay separate from verified providers,
  compared offers and checkout. An explicit request for official links still
  requires corroboration. Uses the existing bounded search stages. The link-only
  response skips Gemini and payment-evidence lookup.
- `web/src/lib/offer-discovery.ts` allows evidence to represent that no model
  turn or tool invocation occurred. The existing provider-research card explains
  incomplete identity or country evidence and shows unknown prices and payments.
- `web/src/server/paypal/public-research.ts` records aggregate initial/follow-up,
  relevance and retained-link counts when official evidence is missing. These
  diagnostics contain no prompts, titles, URLs, credentials, or visitor data.
- `web/test/official-provider-regression.test.ts` replays the exact screenshot
  wording with corroborated results and with sparse identity excerpts. Covers
  known wrong-country sources, the historical unrelated article and reseller,
  clear unverified labels, a non-AI backup search, and explicit official-only
  behavior. `HANDOFF-PAYPAL.md` records the incident and validation.

The code explains how valid pages could be discarded regardless of the search
vendor. It does not establish what the original query retrieved. To evaluate
Tavily vs another retriever, obtain a sanitized live replay showing returned
public result URLs/titles and the evidence-gap counts, then compare useful
first-party coverage on the same requests. There was no release, live provider
query, payment, or financial operation in this follow-up.

Fresh offline checks passed: 229 targeted tests, lint, typecheck, production web
build, repository formatting, whitespace, and the 46-chunk browser boundary
scan. A credential-signature scan found zero matches in the added lines. The
initial new official-only fixture used ambiguous availability wording; it was
revised to explicitly request providers based in Canada and passed on rerun.

### 2026-11-18 — Release the plan-search fallback to main

The user requested publication to `main`. The fetched remote and local base
both point to `ca6251e`. The release includes the five code and test paths
listed in the preceding entry and this handoff update. Commit the reviewed
changes as a single fast-forward update and verify the published SHA and
automatic deployment statuses. The previous 229-test offline validation still
applies. Production replay and retrieval quality remain separate checks.

### 2026-11-19 — Compare shallow and iterative Tavily research

The user asked to try deeper Tavily retrieval and an iterative Gemini workflow
before deciding whether to switch search providers. Created isolated worktree
`/workspace/earmark-paypal-tavily-trial` on `experiment/tavily-iterative-research`
from `origin/main` at `7ba49eb`. The existing local Brave work stays in the
original checkout. Production already has bounded provider/pricing follow-up
search stages. Its Gemini collector uses low thinking and does not plan its own
search calls. `include_answer` was already disabled.

- `scripts/tavily-research-trial.mjs`: standalone comparison for two fixed
  public prompts (`ai`, `email`) on a configured Gemini 3 model. Baseline uses
  one basic search, short snippets and low thinking; this is a simplified
  benchmark arm rather than an exact reproduction of the Production pipeline.
  Deep mode uses at most three advanced searches with three chunks per source
  and a score floor of 0.5. It allows one conditional Extract call with up to
  three previously retained public URLs and caps excerpt/Markdown sizes.
  Gemini runs in high thinking with at most four sequential tool turns. It
  receives the full prior model Content objects, preserving signatures and
  matching function responses, and must synthesize without tools at the cap.
  Instructions require source/date cross-checking, flagging conflict and
  missing evidence. Fixed hosts, private URL checks, distinct short queries,
  time and response limits, and credential separation bound the diagnostic.
  Output lists queries, scores, excerpt lengths, source URLs, elapsed time
  and an unverified model answer for human evaluation.
- `scripts/tavily-research-trial.test.mjs`: mocked assertions for baseline,
  deeper search settings, filtered results, Extract eligibility, unchanged
  Gemini model turns with opaque signatures, forced synthesis and key gating.
- `HANDOFF-PAYPAL.md` records the experiment and its limits.

With `TAVILY_API_KEY`, `GEMINI_API_KEY` and a supported `GEMINI_MODEL` supplied
securely in the shell, run the following for `ai`, then repeat with `email`:

```sh
node --experimental-strip-types scripts/tavily-research-trial.mjs ai baseline
node --experimental-strip-types scripts/tavily-research-trial.mjs ai deep
```

Review relevant first-party links, whether cited pages confirm the stated
plan, whether conflicts are handled and the additional latency. The deep arm
changes several knobs together, so a win warrants a smaller follow-up trial to
isolate which changes helped. A search score is a ranking signal rather than
proof of relevance, ownership or price. A hard cutoff can reduce useful recall.
No Tavily or Gemini key is available in the workspace, so the CLI correctly
stopped before transport. No empirical improvement, provider deployment, push,
payment or production change is established.

Four offline tests passed, as did formatting, changed-script lint and
whitespace checks. Node 22 emitted its expected experimental type-stripping
and module-format notices for the shared TypeScript URL validator.

### 2026-11-19 — Ship bounded deeper Tavily retrieval for phone testing

The user authorized an update to `main` to test in Production without a PC.
Fetched and confirmed `origin/main` at `7ba49eb` in the isolated Tavily
worktree. The separate unpublished Brave trial remains in the original checkout.

- `web/src/server/paypal/offer-discovery.ts`: authorize and dispatch advanced
  Tavily retrieval with three passages in the initial and provider follow-up
  stages. Keep answer and raw-content fields off. Preserve up to 2,400 characters
  per research excerpt for relevance, references and analysis. Use score 0.5 as
  a ranking signal within equal provider/source priorities. Collector instructions
  preserve separate passage evidence and flag contradictions. Deterministic offer
  claims retain their 600-character single-passage window. Existing targeted
  pricing and payment searches, quotas, model settings and deadline stay intact.
- `web/test/offer-discovery.test.ts` and
  `web/test/official-provider-regression.test.ts`: test the exact advanced search
  envelope, snippet caps, separation of tier and amount across passages, and
  corroboration beyond the former excerpt cap for the phone reproduction prompt.
- `scripts/tavily-research-trial.mjs` and
  `scripts/tavily-research-trial.test.mjs`: retain the isolated benchmark above.
  Extract, Gemini high thinking and the multi-turn loop remain experiment-only
  because their latency has not been measured against the public route limit.
- `HANDOFF-PAYPAL.md` records scope and publication checks.

Existing hosted Tavily/Gemini settings apply. Advanced Tavily searches can
consume more credits than basic. No live provider probe, payment or database
operation was performed here. Verify the primary deployment and replay the
reported prompt on Production to assess retrieval quality.

Release checks passed: 196 focused app tests, four standalone trial tests,
typecheck, changed-file lint and formatting, production web build, and browser
boundary scan of 46 chunks. An initial worktree build resolved the other
checkout's workspace package; rebuilding with worktree-local workspace aliases
resolved the type conflict. The request-mutation regression now tests both
directions of depth changes for advanced discovery and basic payment evidence.

### 2026-11-19 — General Gemini query planning and parallel bounded Tavily search

The user requested applying the general intelligent-search upgrade to `main` so
research works across categories rather than targeting a single search term.
Previously, `discoverOffers` sent a single regex-templated Tavily query
(`buildOfferSearchQuery`) capped at five collector results, leaving Gemini
locked out of query formulation.

- `web/src/server/paypal/offer-discovery.ts`: added a general, category-agnostic
  Gemini `planResearchQueries` turn (`queryPlanSchema`, `queryPlanner`,
  `queryPlannerSystem`, `maxOutputTokens: 600`, `thinkingLevel: "low"`, 8s stage
  cap) enabled by default (`EARMARK_RESEARCH_QUERY_PLANNER !== "false"`). Added
  `sanitizePlannedQueries` to block secrets, URLs, emails, prompt-injection
  verbs and payment actions while allowing legitimate pricing terminology such as
  token pricing. Extended `createDiscoveryBoundary` with strict one-shot
  envelopes (`expectedQueryPlan`, `finishQueryPlan`, `completeInitialSearches`)
  and ran 1–3 planned Tavily searches in parallel via `Promise.allSettled` with
  round-robin deduplication. Raised collector input capacity to
  `MAX_COLLECTOR_RESULTS` (10). Planner timeouts, HTTP errors or invalid tool
  outputs fail open to the existing deterministic `buildOfferSearchQuery`
  fallback without failing the request; outbound/secret violations still fail
  closed. All deterministic price/tier/billing/PayPal verification, policy and
  checkout restrictions remain unchanged.
- `web/src/lib/offer-discovery.ts`: widened `OfferDiscoveryResult.evidence`
  `searchRequests` union to `1 | 2 | 3 | 4 | 5 | 6` to reflect parallel initial
  searches plus follow-up stages.
- `web/src/server/paypal/public-research.ts`: added `query_plan` to
  `stageTimeouts` and logged sanitized, non-secret, non-PII `onPlan` and
  `onRetrievalSummary` aggregate metrics.
- `web/test/query-planner-discovery.test.ts` (new): added offline regressions
  covering multi-category query planning (transactional email APIs, physical
  solar lanterns, cloud backup), parallel Tavily retrieval up to 10 collector
  sources, HTTP 503 graceful fallback, `sanitizePlannedQueries` /
  `createDiscoveryBoundary` security checks, and `handlePublicResearch`
  sanitized log verification.
- `web/test/offer-discovery.test.ts`,
  `web/test/official-provider-regression.test.ts`,
  `web/test/research-relevance.test.ts`: pinned
  `EARMARK_RESEARCH_QUERY_PLANNER: "false"` on legacy single-query deterministic
  fixtures so existing call-count and fallback assertions remain intact.
- `HANDOFF-PAYPAL.md`: recorded the change, verification status and remaining
  live-replay requirement.

Verification: `npm ci` could not run inside this ephemeral VM because
`registry.npmjs.org` is blocked (`403 Forbidden`) and Node 24 is installed
against the repo's Node 22 engine constraint; full `npm run check` (Prettier,
Biome lint, TypeScript, Vitest, Foundry and Next.js production build) passed in
GitHub Actions CI (`Earmark PayPal CI` run `44526711188`, Ubuntu and Windows)
before squash-merging PR #5 to `main` (`8fc45dc`). No live provider, database or
payment operations were performed. Live search quality on Production still
requires a post-deployment replay.

### 2026-11-19 — General regional candidate fallback refinement

The user shared a screenshot of `"find $20 chinese ai model plans"` returning
`"No official provider could be verified for the requested country."`
(`DISCOVERY_REGIONAL_PROVIDERS_UNVERIFIED`). Root-cause inspection showed two
overly strict checks in the regional read-only `providerCandidates` fallback in
`discoverOffers` (after `classifyProviderSource` had already verified candidate
relevance and excluded resellers, aggregators, blogs, and spoofed brands):

1. `sourceHasProviderIdentity(source, offerResults)` rejected legitimate
   official pricing/docs pages whenever the product title did not literally
   match a >=4-character root domain stem (e.g., short domains or corporate
   aliases such as `open.bigmodel.cn`, `platform.moonshot.ai`,
   `www.alibabacloud.com`, `docs.z.ai`, `postmarkapp.com`, `ovh.com`, `sap.com`).
2. `knownCountries.every((country) => countries.includes(country))` dropped
   even candidate leads whenever an international pricing page mentioned
   non-HQ deployment regions alongside the requested country.

Changes:

- `web/src/server/paypal/offer-discovery.ts`: removed the redundant
  `sourceHasProviderIdentity` check from the regional `providerCandidates`
  fallback in `discoverOffers`, broadened the acceptable pricing/docs/product
  title match slightly for physical and SaaS categories, and refined the
  country check so providers corroborated or self-identified solely in a
  non-requested country are still excluded while pages mentioning both the
  requested origin and international regions are retained as read-only
  `identity unverified` leads. Explicit `"official links"` requests
  (`explicitlyOfficial`), verified `"first-party"` corroboration rules,
  reseller/editorial blocks, and checkout restrictions remain unchanged.
- `web/test/query-planner-discovery.test.ts`: added an offline regression test
  verifying that regional requests retain clean alias-domain and
  international-endpoint pricing candidates as read-only `providerCandidates`
  without Wikipedia corroboration while excluding providers corroborated in a
  contradicted country.
- `HANDOFF-PAYPAL.md`: updated current-state summary and recorded this change.

Verification: syntax-checked locally with Node 24 (`stripTypeScriptTypes`) and
verified via GitHub Actions `Earmark PayPal CI` (Prettier, Biome lint,
TypeScript, Vitest, Foundry, Next.js build on Ubuntu and Windows) on a PR
branch before merging to `main`. No live provider, database or payment calls
were executed; live Production behavior requires a post-deployment replay.

### 2026-11-19 — Replace Tavily with Brave Search for a controlled trial

The user reported the same empty Production error for
`Find me a $20 Chinese ai model plan` and requested trying another search
provider. Verified main at `7ba49eb` and confirmed the primary project passed
its deployment check. The secondary Vercel project failed its check. No live
search trace was available, so the original retrieval-versus-filtering failure
is still undiagnosed. Selected Brave Search for its public web result envelope
with titles, URLs and excerpts, and checked its public API documentation.

- `web/src/server/paypal/offer-discovery.ts`: use the fixed Brave web endpoint
  for initial discovery, independent provider corroboration, targeted pricing
  and payment evidence. Authorize the exact bounded GET URL and subscription
  header, block redirects and caching, validate the response, and feed its
  titles, URLs and descriptions into the existing validation path. The search
  limits and collector/price/identity rules remain. Also trim `Find me a` from
  the search query and keep a branded pricing page when the excerpt identifies
  its publisher but the title uses a product brand, as an unverified link only.
- `web/src/server/paypal/public-research.ts`,
  `web/src/server/paypal/judge-http.ts`,
  `web/src/server/paypal/agent-checkout-http.ts`,
  `web/src/lib/offer-discovery.ts` and
  `web/src/components/purchasing-chat.tsx`: require the Brave key, map provider
  errors and recognize the `LIVE_BRAVE_SEARCH` result. Tavily has no active
  runtime path or credential fallback.
- `.env.example`, `web/.env.example` and
  `docs/task-08b-deployment-readiness.md`: document the server key and live
  trial. Existing Gemini and quota settings are still required. Configure the
  Brave subscription token in the authorized test environment before enabling
  or releasing live research. A legacy key alone leaves research unavailable.
- `scripts/paypal-secret-check.ts`, `scripts/check-web-boundary.mjs`, and
  `scripts/preview-smoke.mjs`: include the new key in secret/bundle scans and
  update the mock research UI to the new provider result. The browser scanner
  still guards against leakage of legacy search credentials.
- `web/test/fixtures/brave-search.ts`, `web/test/offer-discovery.test.ts`,
  `web/test/official-provider-regression.test.ts` and
  `web/test/research-relevance.test.ts`: use Brave-shaped fixtures and assert
  outbound origin, exact query, headers, query length, rejection of the retired
  endpoint and fail-closed behavior without the new key. Replay the exact
  screenshot text with independent verification and sparse search excerpts,
  reject irrelevant and wrong-country results, and exercise non-AI searches.
- `HANDOFF-PAYPAL.md` records the trial and handoff.

Live acceptance remains blocked on a Brave key. No Brave or Gemini service
credentials were configured in this workspace. Only public documentation was
read over the network. No metered query, deployment, push, payment or database
operation was performed. Fixture success does not establish that Brave has
better live coverage or current prices. After configuration, replay the exact
request and a non-AI search while checking the aggregate verification counts.

Fresh checks passed: 231 targeted offline tests, lint, TypeScript, production
web build, full formatting, whitespace, 46-chunk browser boundary and the
added-content credential scan. Offline Chromium smoke passed eight pages and
the Brave-shaped browser research response, with zero external requests or
browser exceptions. Initial migration checks exposed stale POST assertions,
unused fixture parameters and untyped fixture arrays. Those fixtures were
updated to check the GET contract and the final checks passed.

### 2026-11-19 — Prepare the Brave switch for Production

The user confirmed saving `BRAVE_SEARCH_API_KEY` for the primary deployment
and asked to continue. Integrated the trial on top of main at `5c0007d`,
which includes the Gemini planner from `8fc45dc` and regional alias-domain
fallback from `5c0007d`.

- `web/src/server/paypal/offer-discovery.ts` issues the planner's existing
  one to three searches through Brave. The outbound guard authorizes each
  exact encoded planned URL once and continues requiring the exact URL for
  each follow-up stage. Identical encoded queries are deduplicated. The
  collector source cap, deadlines, and regional provider checks are retained.
- `web/src/lib/offer-discovery.ts` and
  `web/src/server/paypal/public-research.ts` retain planner-era evidence
  counts and sanitized diagnostics while reporting Brave as the source.
- `web/test/query-planner-discovery.test.ts` exercises the planned GET
  envelope, rejection of an injected and a replayed URL, deterministic
  search after a planner failure, and regional fallback using Brave fixtures.
  The earlier trial entry lists the remaining updated paths.

Fresh checks passed on the rebased code: 240 focused offline tests, lint,
TypeScript, the production web build, and the browser boundary check across
46 compiled chunks. The first planner boundary fixture omitted the bounded
site exclusions and was corrected to assert the actual URL contract. No
Production request was submitted. Deployment status and live search quality
must be verified separately. Retest the original regional request and one
unrelated category on the primary app.

### 2026-11-19 — Widen Brave discovery for a controlled comparison

The user reported that the live Brave results for `find $20 chinese ai models`
surfaced a pricing article and a model directory as unverified provider leads
and asked to widen discovery. This change isolates retrieval depth so a
Production replay can measure its effect separately from provider
classification.

- `web/src/server/paypal/offer-discovery.ts` requests up to ten results for
  each initial query and for the existing provider corroboration search.
  With three planned queries, up to 30 initial results can be screened. At
  most ten screened sources enter the Gemini offer collector. The request
  limits, deadlines, source checks, and targeted pricing and PayPal evidence
  limits stay the same.
- `web/test/offer-discovery.test.ts` checks the widened outbound request.
  `web/test/query-planner-discovery.test.ts` exercises two ten-result search
  responses and the ten-source collector cap. The first test run uncovered an
  overly broad fixture assertion that also checked the three-result payment
  evidence search. The assertion now checks the planned discovery requests.
- `web/test/official-provider-regression.test.ts` places a weather API pricing
  or documentation source and its independent identity reference at rank six
  in their respective searches. The official URL survives even with empty
  Gemini offers.

Production search quality remains unverified. The provider candidate rules
still need separate evaluation for the reported articles and directories.

Verification passed on the local changes: 241 focused offline tests, lint,
typecheck, production web build, the 46-chunk browser credential scan,
formatting and whitespace checks. No live search request was submitted.

### 2026-11-19 — Record scope guidance in AGENTS.md

At the user's request, added a concise rule to `AGENTS.md` to keep fixes
targeted, reuse existing code, and justify additional search stages,
dependencies, or infrastructure. Refactoring and UI changes should support
the requested behavior. This is a documentation update. Formatting and
whitespace checks passed for both documents.

### 2026-11-20 — Rebuild first-party offer evidence

The user supplied the `Earmark-refined.mp4` walkthrough and asked to rebuild
offer research around relevant merchant links, source-backed budget
comparisons, and manual review. The previous pipeline sent topical roundups
into Gemini and incomplete comparisons for unscoped searches. A pricing
article and model directory could also pass the regional candidate gate
because their titles resembled product pages. When Gemini failed, even a
known first-party link lost its verification label.

- `web/src/server/paypal/offer-discovery.ts` applies the provider and
  relevance gate before the collector. It excludes year-stamped buying
  guide titles and cross-provider indexes, preserves plausible product
  pages as unverified research leads where supported, and retains strict
  independent proof for verified identity and requested origin. The existing
  planner requests provider-specific pricing and independent identity
  evidence for regional searches. Existing aggregate logs now include
  rejection counts without sending queries, links, or excerpts to logs.
- `web/src/lib/offer-discovery.ts`, `web/src/components/purchasing-chat.tsx`,
  and `web/src/components/offer-discovery.tsx` carry verified identity
  through a recoverable collector failure. The UI displays the verified
  merchant link and leaves incomplete plan terms unverified.
- `web/test/official-provider-regression.test.ts` exercises DeepSeek,
  Alibaba Cloud/Qwen, and Moonshot/Kimi for China, and OpenAI, Google, and
  Anthropic for the US. The official links survive empty Gemini output.
  Fixtures reject the Pickurai pricing article, the Chinese AI Tools
  index, wrong-country results, and resellers. The weather API fixture
  verifies both the $12/month fit and the $35/month over-budget result
  against $25/month, with PayPal unknown in both cases.
- `web/test/offer-discovery.test.ts` checks that roundups and changelogs
  cannot populate the collector or incomplete comparison.
  `web/test/research-relevance.test.ts` verifies the identity badge and
  linked source through a failed collector response.
- `scripts/preview-smoke.mjs` checks that the verified identity badge
  survives the browser's incomplete-comparison response handling.

No extra search or model stages, dependencies, quota or deadline changes,
payment operations, or database changes. The tests use constructed evidence,
including representative URLs for the reported titles where the screenshot
did not show a URL. No live query, Git push, or deployment was performed.
Sparse independent search excerpts can still leave genuine provider
identity or origin unverified. Replay the three benchmarks in the live
environment before assessing search quality.

Verification passed locally: 243 focused offline tests, lint, typecheck,
production build, formatting and whitespace checks, and the 46-chunk browser
credential scan. Chromium smoke passed eight pages and the mocked public
research flow with zero external requests or browser exceptions.

### 2026-11-20 — Live baseline before publishing the rebuild

The user asked to confirm the three benchmarks. GitHub reported the primary
deployment succeeded at `71c8271`. The rebuild was still local, and this
workspace had no Brave, Gemini, or Vercel credentials for a separate live
run. The existing production app reported research available.

Submitted each benchmark once through the public research endpoint.
All three returned HTTP 200. The Chinese AI query returned only research
leads from Pickurai, Chinese AI Tools, and AIUpdateWatch. It recorded two
search requests, ten results, and zero model turns. The US AI query returned
Microsoft Azure and Use AI as research leads without verified providers or
offers. The weather API query found WeatherAPI.com, Visual Crossing,
Xweather, and meteoblue pricing links among mixed leads, but returned one
offer with unknown price and billing, unknown PayPal, and a needs-evidence
verdict. No benchmark returned a verified official provider.

These results describe the published baseline, not the local rebuild. Live
verification of the rebuild requires publishing it to an authorized
environment with provider credentials. No Git publication, deployment,
PayPal operation, or financial database operation was performed in this
check. The app used its ordinary research quota.

### 2026-11-20 — Production replay after first-party research rebuild

At the user's request, pushed the tested rebuild to `main` as `4f46a37`.
GitHub reported the primary Vercel deployment completed. The deployment ran
after the 243 focused offline tests, lint, typecheck, browser boundary scan,
production build, and offline Chromium smoke passed.

Replayed each public research benchmark once. All returned HTTP 200.

- China AI: four searches produced 40 results. The cards included official
  DeepSeek and Alibaba Cloud pricing pages as unverified leads. A Kimi
  platform link, Kimi K2, and the BenchLM comparison site also appeared as
  leads. The original Pickurai and Chinese AI Tools entries were absent.
  No verified provider or comparable offer was returned.
- US AI: three searches produced 30 results. Claude's pricing docs appeared
  as an unverified lead. No verified provider or comparable offer was
  returned.
- Weather API: several real providers' pricing pages appeared as unverified
  leads. Gemini returned generic WeatherAPI.com and Meteosource offer
  names. Both had unknown price, billing, and PayPal acceptance, with a
  needs-evidence verdict.

The live results confirm that relevant pricing links can reach the app,
while independent identity verification and exact tier pricing remain
unresolved. The public responses contain no rejection trace for individual
sources. No payment or financial database operation was performed. This entry
records the replay in the local handoff after publication.

### 2026-11-20 — Use additional excerpts as independent pricing evidence

A new screenshot showed the DecodeError guide as a weather API provider
lead, and Xweather's pay-as-you-go calculator with unknown billing. Public
HTML confirmed the observed guide title and a similar date-stamped title
on the BenchLM comparison site seen in the prior replay. The deterministic
pricing path also discarded every passage after the first, although Gemini
could see the longer source text.

- `web/src/server/paypal/offer-discovery.ts` requests Brave's documented
  `extra_snippets` on the existing discovery, provider corroboration, and
  pricing lookups. It sends at most three additional bounded excerpts to
  the collector and verifies rates one passage at a time. The same
  outbound guard validates each exact search URL. Payment-method search
  retains the original envelope. Provider billing can be inferred from an
  explicit usage-based phrase in the page title. The editorial heuristic
  now recognizes the observed date-heading punctuation and month years.
- `web/test/fixtures/brave-search.ts`, `web/test/offer-discovery.test.ts`,
  and `web/test/query-planner-discovery.test.ts` exercise the updated
  envelope and prove that a later self-contained quote can be used.
  Split tier and price evidence still fails verification.
- `web/test/official-provider-regression.test.ts` rejects the observed
  DecodeError and BenchLM guides and checks Xweather's usage-based label
  with price and PayPal still unknown.

No new search stages or direct merchant fetcher were added to the app.
Research request caps, timeouts, and payment safeguards are unchanged.
Only public documentation and public page HTML were read. The change is
local. Live Brave behavior with the production key and independent
provider corroboration still require verification.

The public Weatherstack page showed a $9.99 monthly rate, which was absent
from the production screenshot. Xweather's public page confirmed usage-based
pricing. These observations describe the merchant pages, not an app replay.
Fresh local checks passed: 247 focused tests, lint, typecheck, production
build, formatting and whitespace checks, and the 46-chunk browser
credential scan.

### 2026-11-20 — Clean-slate hybrid search rebuild on branch `gemini-fix`

The user requested a clean-slate rebuild of the offer search mechanism on a
dedicated `gemini-fix` branch aligned with the Earmark AI demo flow (source-
matched merchant plan cards with exact prices, billing periods, features,
honest unknown PayPal/delivery/SLA states, and session-only assisted manual
checkout review).

Changes:

- `web/src/server/paypal/search/guard.ts` (new): instruction/secret/PII/action
  guard (`discoveryInstruction`), budget and Gemini 3 model validation, safe
  public HTTPS merchant URL filtering (blocking `vertexaisearch.cloud.google.com`
  redirects, raw IPs, loopback/local hosts, and third-party/editorial domains).
- `web/src/server/paypal/search/page-fetch.ts` (new): SSRF-safe direct merchant
  pricing page fetcher (`dns.lookup` private/reserved IP blocking, HTTPS-only,
  `redirect: "error"`, 5s per-page timeout, 200 KB cap, up to 4 pages) with
  HTML-to-plain-text extraction and graceful fallback to search excerpts.
- `web/src/server/paypal/search/grounding.ts` (new): hybrid Stage 1 discovery
  using Gemini native `google_search` + structured JSON output (`gemini-3.8-flash`),
  automatic fallback to Brave Search when `google_search` is unavailable or
  returns no merchant URLs, and a single structured Gemini extraction pass with
  automatic fallback to `gemini-3.5-flash-lite` on transient errors.
- `web/src/server/paypal/search/verify.ts` (new): deterministic server-side
  price (`Source-matched`), billing period, PayPal acceptance, budget fit,
  recommendation (`reviewRecommendation`), and policy (`EXTERNAL_MERCHANT_UNBOUND`)
  verification against the actual retrieved/fetched merchant page text.
- `web/src/server/paypal/offer-discovery.ts`: replaced the legacy 4,236-line
  implementation with a compact 3-stage orchestrator preserving the exported
  `discoverOffers`, `discoveryInstruction`, `ResearchStageFailure`,
  `PartialComparisonContext`, and `PublicResearchTiming` contract.
- `web/src/lib/offer-discovery.ts`: widened `OfferDiscoveryResult.source` to
  include `"LIVE_GEMINI_GROUNDED"` and `evidence.searchProvider` to include
  `"gemini-google-search" | "hybrid"`.
- `web/src/server/paypal/public-research.ts`: updated `stageTimeouts` for
  `grounded_search` and `page_fetch`, removed the obsolete `payment_evidence`
  branch, and made `BRAVE_SEARCH_API_KEY` optional when `GEMINI_API_KEY` is set.
- `web/test/search-pipeline.test.ts` (new) and removed obsolete legacy search
  tests (`web/test/offer-discovery.test.ts`,
  `web/test/official-provider-regression.test.ts`,
  `web/test/query-planner-discovery.test.ts`,
  `web/test/research-relevance.test.ts`, `web/test/fixtures/brave-search.ts`):
  added offline unit and security coverage for guards, SSRF IP checks, HTML
  extraction, deterministic price/PayPal verification, Gemini `google_search` +
  page-fetch flow, Brave fallback, and `handlePublicResearch` with
  `GEMINI_API_KEY` alone.
- `HANDOFF-PAYPAL.md`: updated current-state summary and recorded this rebuild.

Verification: syntax-checked all modified/added `.ts` files locally with Node 24
(`stripTypeScriptTypes`) and pushed `gemini-fix` for full GitHub Actions
`Earmark PayPal CI` verification (`format:check`, `lint`, `typecheck`, `test`,
`build` on Ubuntu and Windows). No live Gemini/Brave API, database, or PayPal
operations were executed; live grounding and page-fetch behavior require a
post-deployment or local-key replay.
