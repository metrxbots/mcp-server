# Metrx MCP Server

<!-- mcp-name: io.github.metrxbots/mcp-server -->

[![npm version](https://img.shields.io/npm/v/@metrxbot/mcp-server)](https://www.npmjs.com/package/@metrxbot/mcp-server)
[![CI](https://github.com/metrxbots/mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/metrxbots/mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Smithery](https://smithery.ai/badge/@metrxbot/mcp-server)](https://smithery.ai/server/metrxbot/mcp-server)
[![Glama](https://glama.ai/mcp/servers/metrxbots/metrx-mcp-server/badge)](https://glama.ai/mcp/servers/metrxbots/metrx-mcp-server)

**Your AI agents are wasting money.** Metrx finds out how much, and fixes it.

The official [MCP server](https://modelcontextprotocol.io) for [Metrx](https://metrxbot.com) — the AI Agent Cost Intelligence Platform. Give any MCP-compatible agent (Claude, GPT, Gemini, Cursor, Windsurf) the ability to track its own costs, detect waste, optimize model selection, and prove ROI.

## Why Metrx?

| Problem | What Metrx Does |
|---------|-----------------|
| No visibility into agent spend | Real-time cost dashboards per agent, model, and provider |
| Overpaying for LLM calls | Provider arbitrage finds cheaper models for the same task |
| Runaway costs | Budget enforcement with auto-pause when limits are hit |
| Wasted tokens | Cost leak scanner detects retry storms, context bloat, model mismatch |
| Can't prove AI ROI | Revenue attribution links agent actions to business outcomes |

## Quick Start

### One-command install (Claude Desktop, Cursor, Windsurf)

```json
{
  "mcpServers": {
    "metrx": {
      "command": "npx",
      "args": ["@metrxbot/mcp-server"],
      "env": {
        "METRX_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Get your free API key at [app.metrxbot.com/sign-up](https://app.metrxbot.com/sign-up).

### Verify your setup

After installing, verify your API key works:

```bash
METRX_API_KEY=sk_live_your_key_here npx @metrxbot/mcp-server --test
```

You should see `✓ Connection successful!` and a ready-to-paste MCP client config.

### Remote HTTP endpoint

For remote agents (no local install needed):

```
POST https://metrxbot.com/api/mcp
Authorization: Bearer sk_live_your_key_here
Content-Type: application/json
```

### From npm

```bash
npm install @metrxbot/mcp-server
```

## 23 Tools Across 10 Domains

### Dashboard (2 tools)
| Tool | Description |
|------|-------------|
| `metrx_get_cost_summary` | Total spend, call counts, error rates, agent breakdown, and optimization opportunities |
| `metrx_list_agents` | All agents with status, category, cost metrics, and health indicators |

### Optimization (4 tools)
| Tool | Description |
|------|-------------|
| `metrx_get_provider_arbitrage` | Compare costs across providers — find cheaper alternatives |
| `metrx_get_revenue_intelligence` | Revenue per agent with confidence scores and ROI metrics |
| `metrx_get_token_guardrails` | Token limit recommendations and overflow detection |
| `metrx_get_model_recommendations` | Model switching recommendations based on cost, latency, quality |

### Budgets (4 tools)
| Tool | Description |
|------|-------------|
| `metrx_create_budget` | Create monthly/daily budgets with hard, soft, or monitor enforcement |
| `metrx_update_budget` | Update limits, frequency, or enforcement mode |
| `metrx_list_budgets` | All budgets with current spend vs. limits |
| `metrx_delete_budget` | Remove a budget (historical data preserved) |

### Alerts (3 tools)
| Tool | Description |
|------|-------------|
| `metrx_create_alert_policy` | Alert on cost overages, error rates, latency spikes, anomalies |
| `metrx_update_alert_policy` | Update thresholds, channels, enable/disable |
| `metrx_list_alerts` | Active alerts and current status per agent |

### Experiments (2 tools)
| Tool | Description |
|------|-------------|
| `metrx_start_experiment` | A/B test comparing two LLM models with traffic splitting |
| `metrx_get_experiment_results` | Statistical significance, cost delta, and recommended action |

### Cost Leak Detector (2 tools)
| Tool | Description |
|------|-------------|
| `metrx_scan_cost_leaks` | Find cost anomalies and waste across your fleet |
| `metrx_analyze_cost_leak` | Deep-dive into a specific anomaly with timeline and root cause |

### Attribution (2 tools)
| Tool | Description |
|------|-------------|
| `metrx_attribute_task` | Link agent actions to business outcomes for ROI tracking |
| `metrx_get_attribution_report` | Multi-source attribution report with confidence scores |

### ROI & Reporting (2 tools)
| Tool | Description |
|------|-------------|
| `metrx_get_upgrade_justification` | ROI report for tier upgrades based on usage patterns |
| `metrx_generate_roi_audit` | Board-ready ROI audit report |

### Alert Configuration (2 tools)
| Tool | Description |
|------|-------------|
| `metrx_configure_alert_threshold` | Set cost/operational thresholds with email, webhook, or auto-pause |
| `metrx_get_failure_predictions` | Predictive analysis — identify agents likely to fail before it happens |

## Prompts

Pre-built prompt templates for common workflows:

| Prompt | Description |
|--------|-------------|
| `analyze-costs` | Comprehensive cost overview — spend breakdown, top agents, optimization opportunities |
| `find-savings` | Discover optimization opportunities — model downgrades, caching, routing |
| `cost-leak-scan` | Scan for waste patterns — retry storms, oversized contexts, model mismatch |

## Examples

### "How much am I spending?"

```
User: What was my AI cost this week?
→ metrx_get_cost_summary(period_days=7)

Total Spend: $234.56 | Calls: 2,450 | Error Rate: 0.2%
├── customer-support: $156.23 (1,800 calls)
└── code-generator: $78.33 (650 calls)

💡 Switch customer-support from GPT-4 to Claude Sonnet: Save $42/week
```

### "Find me savings"

```
User: Am I overpaying for my agents?
→ metrx_get_provider_arbitrage(agent_id="agent_123")

Current: GPT-4 @ $15.20/1K calls
Alternative: Gemini 1.5 @ $6.80/1K calls (-55%)
Estimated Savings: $420/month
```

### "Test a cheaper model"

```
User: Test Claude 3.5 Sonnet against my GPT-4 setup
→ metrx_start_experiment(name="Claude Trial", agent_id="agent_123",
    model_a="gpt-4", model_b="claude-3-5-sonnet", traffic_split=10)

Experiment started: 90% GPT-4, 10% Claude 3.5 Sonnet
Check back in 14 days for statistical significance.
```

## Companion Tool: Cost Leak Detector

This repo also includes [`@metrxbot/cost-leak-detector`](./packages/cost-leak-detector) — a free, offline CLI that scans your LLM API logs for wasted spend. No signup, no cloud, no data leaves your machine.

```bash
npx @metrxbot/cost-leak-detector demo
```

It runs 7 checks (idle agents, premium model overuse, missing caching, high error rates, context overflow, no budgets, arbitrage opportunities) and gives you a scored report in seconds. See the [full docs](./packages/cost-leak-detector/README.md).

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `METRX_API_KEY` | Yes | Your Metrx API key ([get one free](https://app.metrxbot.com/sign-up)) |
| `METRX_API_URL` | No | Override API base URL (default: `https://metrxbot.com/api/v1`) |

## Rate Limiting

60 requests per minute per tool. For higher limits, contact support@metrxbot.com.

## Development

```bash
git clone https://github.com/metrxbots/mcp-server.git
cd mcp-server
npm install
npm run typecheck
npm test
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Links

- **Website**: [metrxbot.com](https://metrxbot.com)
- **Docs**: [docs.metrxbot.com](https://docs.metrxbot.com)
- **npm**: [@metrxbot/mcp-server](https://www.npmjs.com/package/@metrxbot/mcp-server)
- **Smithery**: [metrxbot/mcp-server](https://smithery.ai/server/metrxbot/mcp-server)
- **Support**: support@metrxbot.com

## A Note on Naming

The product is **Metrx** (metrxbot.com). The npm scope is `@metrxbot` and the Smithery listing is `metrxbot/mcp-server`. The GitHub organization is `metrxbots` (with an **s**) because `metrxbot` was already taken on GitHub. If you see `metrxbot` vs `metrxbots` across platforms, they're the same project — just a GitHub namespace constraint.

## License

MIT — see [LICENSE](./LICENSE).


## 💬 Feedback

Did Metrx work for you? We'd love to hear it — good or bad.

- **GitHub Discussions**: [Start a thread](https://github.com/metrxbots/mcp-server/discussions) — questions, ideas, what you're building
- **Bug reports**: [Open an issue](https://github.com/metrxbots/mcp-server/issues)
- **Quick feedback**: Drop a comment on our [Product Hunt listing](https://www.producthunt.com/products/metrx)

If you installed but hit a snag, tell us what happened — we read every report.
