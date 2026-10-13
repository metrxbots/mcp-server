# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

## [0.2.7] - 2026-10-13

### Removed
- **`total_revenue_impact_cents` and the "Revenue Impact" line in `get_optimization_recommendations`.** The hosted Metrx engine removed this field because it summed revenue figures of opposite sign, so the total did not mean anything. The real API never returned it. Only demo mode showed it, as "Revenue Impact: $425.00/month", and that line shipped in 0.2.6.
  - `src/services/demo-client.ts`: the demo optimization fixture no longer sets the field.
  - `src/services/formatters.ts`: `formatOptimizations` no longer renders the line. A field sent by an older backend is ignored.
  - `src/types.ts`: the field is removed from `OptimizationResult`.
  - Regression tests in `src/services/formatters.test.ts` check the demo output and a legacy payload.

### Changed
- Version locations synchronized to `0.2.7` across `package.json`, `package-lock.json`, `server.json` (×2), `smithery.yaml`, `src/constants.ts`, and the version-pinning tests.

## [0.2.6] - 2026-10-13

### Fixed
- **Crash when the Metrx API omits attribution fields for your plan.** The API leaves out attribution money on plans that do not include it: per-agent `roi_multiplier`, `net_profit_cents`, `attributed_revenue_cents`, `attributed_outcome_count` and `avg_attribution_confidence` are omitted on starter, lite and unknown tiers. On summary-only (Lite), the dashboard keeps the attributed outcome count and drops revenue, net value and the multiple. Version 0.2.5 typed these fields as `T | null` and never as absent, so it called `.toFixed()` on `undefined` (or on `null`) and threw a `TypeError`. Every reader now handles three states: a number shows the value; `null` shows "no attributed revenue"; an absent field drops the line or says the plan does not include attribution. The wording matches the hosted MCP.
  - `generate_roi_audit` (`src/tools/roi-audit.ts`): per-agent multiple, risk flags and fleet summary. On a plan without attribution the audit no longer reports `$0.00` revenue or flags "No attribution data". It now reads `attribution_confidence`, the field the API sends; the old code read `avg_confidence` and so always showed 0%. Per-agent attributed revenue now appears when the API sends it.
  - `get_cost_summary` → `formatDashboard` (`src/services/formatters.ts`): the summary-only attribution block and the per-agent multiple.
  - `list_agents` (`src/tools/dashboard.ts`): per-agent multiple.
  - `get_task_roi` (`src/tools/attribution.ts`): `roi_multiplier` and `weighted_avg_confidence` are `null` when revenue or cost is 0. Absent attribution now reads "not included in your plan".
  - `src/types.ts`: these fields are now optional (`?:`), so the compiler flags any unguarded read.
- **Methodology copy in `generate_roi_audit` named the wrong formula.** It said "ROI = (Attributed Revenue - Cost) / Cost", but the figure shown is attributed revenue ÷ AI cost, a return multiple. The copy and labels now say "attributed revenue multiple = Attributed Revenue ÷ AI Cost".

### Changed
- Version locations synchronized to `0.2.6` across `package.json`, `package-lock.json` (was stale at `0.2.3`), `server.json` (×2), `smithery.yaml`, `src/constants.ts`, and the version-pinning tests.

## [0.2.5] - 2026-05-28

### Fixed
- **Microcents unit conversion was 100× wrong** (correctness bug — affected every dollar value the server displayed or wrote).
  Convention is `1 cent = 10,000 microcents → 1 dollar = 1,000,000 microcents` (source: `apps/gateway/src/cost.ts`).
  The `0.2.1` "100× too high" fix was compensating for a transient backend `/100` inflation bug that the agentledger team later fixed properly; the compensating divisor in this package was never reverted, leaving costs reported **100× too low** and budgets stored **100× too high** (a `$50` cap was being persisted as `$5,000`).
  - `src/services/formatters.ts` — `formatMicrocents` divisor `100_000_000` → `1_000_000`.
  - `src/tools/budgets.ts` — `set_budget` `limit_dollars * 100_000_000` → `* 1_000_000`.
  - `src/tools/attribution.ts` — `get_task_roi` cost conversions (total + by-model) corrected.
  - Demo client fixtures (`src/services/demo-client.ts`) re-scaled to match the corrected convention so demo dollar figures match the formatter output.
  - Regression suite (`src/services/formatters.test.ts`) pins `formatMicrocents(1_000_000) === "$1.00"` so this class can't silently come back.
- `get_attribution_report` (`src/tools/attribution.ts`) — the tool was sending `model` and `agent_id` query params plus expecting an aggregated response shape that the canonical `/api/outcomes` endpoint never returned. Repointed to consume the actual flat outcomes list and aggregate (count, total value, top contributing agents) client-side. Filtering by `agent_id` is now done in-process.
- `get_attribution_report` enum updated from `['direct','last_touch','first_touch']` to the canonical `['direct','session_direct','first_touch','last_touch']` (source: `agentledger apps/web/lib/attribution/types.ts`). Note: the `/api/outcomes` endpoint ignores attribution method, so this param is informational on the report tool.
- `get_task_roi` (`src/tools/attribution.ts`) — now sends both `days` and `start_date`/`end_date` so the tool works against the legacy `/api/agents/:id/roi` (days-only) and the date-range-aware backend shipping alongside this release.
- `src/tools/model-pricing.ts` — reconciled the pricing map against `agentledger apps/gateway/src/cost.ts` (May 2026 verified). Added current-generation models: `gpt-5.2`, `gpt-4`, `o1`, `o1-mini`, `o3-mini`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-opus-4`, `claude-haiku-4`, `gemini-2.0-flash`, `gemini-2.0-pro`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `grok-2`, `grok-2-mini`. Corrected `gemini-1.5-pro` to `$1.25 / $3.75` per 1M (Google price cut). Added the `xai` provider and dated the table to May 2026.
- `src/tools/experiments.ts` — `auto_promote` description now says "completes" to match the actual status enum (`draft|running|paused|completed`).

### Changed
- Version locations synchronized to `0.2.5` across `package.json`, `server.json` (×2), `smithery.yaml`, `src/constants.ts`, and version-pinning tests (`api-client.test.ts`, `server-integration.test.ts`, `comprehensive-funnel.test.ts`).

## [0.2.3] - 2026-03-13 (unreleased prior to 0.2.5)

### Added
- Telemetry ping to `/api/telemetry/demo` on `--demo` startup so we can measure npm-install → signup conversion.
- `?source=mcp` UTM attribution on every signup URL surfaced to users (auth flow, postinstall banner, README, error messages).

### Fixed
- Rate limiter — explicit tool→category mapping (BUG-1) so tools registered across multiple domains are rate-limited under the right bucket.
- Closed several gaps in the NPM → signup funnel.

## [0.2.2] - 2026-03-11

### Added
- `--demo` mode for trying the MCP server without an API key
- `--auth` CLI login flow to reduce signup friction
- DRY'd API client headers into shared getter using constants

### Fixed
- `ping()` now uses `fetchWithRetry` for transient 5xx errors
- cost-leak-detector CI: root `.gitignore` was excluding `packages/*/dist/`, preventing dist from being checked out in CI

### Changed
- Eliminated duplicated tool registration in `index.ts`

## [0.2.1] - 2026-03-11

### Fixed
- `api-client.ts`: PATCH method now uses `fetchWithRetry` instead of raw `fetch` (budget updates and alert acks had zero retry on failure)
- `attribution.ts`: Microcent division fixed from `/1_000_000` to `/100_000_000` (costs were displaying 100× too high)
- `model-pricing.ts`: Added `claude-sonnet-4-20250514` pricing entry + fixed alias pointing to wrong model
- `upgrade-justification.ts`: Fixed tier name ("Free" → "Starter"), typo (`upgratedSavings`), broken breakeven math, unused variable
- `smithery.yaml`: Version aligned to `0.2.1`
- `server.json`: Description aligned with smithery
- `README.md`: Replaced fabricated tool names with actual 23 registered tools, corrected per-domain counts, fixed examples

## [0.2.0] - 2026-03-11

### Added
- `@metrxbot/cost-leak-detector` companion CLI package — free offline tool that scans LLM API logs for wasted spend (7 checks, scored report, no signup required)
- Detailed per-category rate-limiting table in README
- `?source=mcp` UTM tracking on all sign-up URLs for attribution
- Per-client config snippets in `--test` output (Claude Desktop, Cursor, Windsurf)
- `mk_` API key prefix support in `--test` validation
- "Companion Tool" and "A Note on Naming" sections in README

### Fixed
- Corrected Lite tier pricing from $299/month to $19/month in upgrade justification
- Added missing Pro tier ($49/month) to upgrade justification

### Changed
- `server.json`: added `title`, `websiteUrl`, expanded description, `remoteEndpoints` → `remotes` per latest MCP schema
- Smarter postinstall banner that detects existing API key

## [0.1.3] - 2026-03-09

### Added
- `--test` CLI flag for API key verification before starting stdio transport (`npx @metrxbot/mcp-server --test`)
- `ping()` method on `MetrxApiClient` for lightweight connectivity checks
- `scripts/postinstall.cjs` — friendly welcome banner after `npm install` with signup and test instructions (CI-safe, non-blocking)

### Fixed
- Fixed all API key management URLs to point to `https://app.metrxbot.com/settings/security` (was pointing to non-existent `/settings/api-keys`)
- Fixed signup URL to `https://app.metrxbot.com/sign-up` (was pointing to non-existent `/onboard`)
- `X-MCP-Client` header now correctly reports `metrx-mcp-server/0.1.3` (was stuck at `0.1.0`)
- Improved missing-API-key error message with actionable signup and test instructions

### Changed
- Renamed `main()` to `runServer()` in `index.ts` for clarity
- Added `scripts/` directory to npm package `files` array

## [0.1.2] - 2026-03-05

### Fixed
- Removed 23 deprecated unprefixed tool aliases (e.g. `get_cost_summary`) that were polluting `tools/list` with `[DEPRECATED:]` description text and hurting Smithery tool quality scoring
- Aligned `index.ts` (stdio entrypoint) with `server-factory.ts` — now both register exactly 23 `metrx_`-prefixed tools

### Added
- 3 MCP prompts (`analyze-costs`, `find-savings`, `cost-leak-scan`) now exposed via the stdio entrypoint (`npx @metrxbot/mcp-server`) for Smithery discoverability

## [0.1.1] - 2026-03-05

### Fixed
- Corrected mcpName namespace from `com.metrxbot/mcp-server` to `io.github.metrxbots/mcp-server`
- Fixed RateLimiter deduplication for tools registered across multiple domains
- Corrected import paths in server factory

### Changed
- Updated server.json to match npm package version

## [0.1.0] - 2026-03-04

### Added
- Initial public release
- 23 MCP tools across 10 intelligence domains: cost dashboard, optimization, budgets, alerts, experiments, cost leak detection, attribution, ROI auditing, alert configuration, upgrade justification
- 3 built-in prompts: `analyze-costs`, `find-savings`, `cost-leak-scan`
- Rate limiting middleware for all tool calls
- Streamable HTTP and stdio transport support
- Published to npm as `@metrxbot/mcp-server`
- Published to Official MCP Registry as `io.github.metrxbots/mcp-server`
