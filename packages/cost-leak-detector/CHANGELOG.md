# Changelog

## 0.1.0 (2026-03-03)

Initial release.

- 7 cost leak detection checks: idle agents, premium models for simple tasks, missing caching, high error rates, context overflow, no budget limits, cross-provider arbitrage
- CLI with `scan` and `demo` commands
- `--ci` flag for clean CI/CD output (no ANSI color codes)
- `--threshold` flag to fail CI builds when estimated waste exceeds a dollar amount
- Metrx Score (0-100) health grade with letter grades (A-F)
- Support for OpenTelemetry JSON and CSV input formats
- Built-in pricing for 20+ LLM models (OpenAI, Anthropic, Google, Meta, Mistral)
- Table and JSON output formatters
