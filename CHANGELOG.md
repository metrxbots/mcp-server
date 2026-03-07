# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
