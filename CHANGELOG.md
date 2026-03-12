# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

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
