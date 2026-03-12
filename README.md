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

### Dashboard (3 tools)
| Tool | Description |
|------|-------------|
| `metrx_get_cost_summary` | Comprehensive cost summary — total spend, call counts, error rates, and optimization opportunities |
| `metrx_list_agents` | List all agents with status, category, cost metrics, and health indicators |
| `metrx_get_agent_detail` | Detailed agent info including model, framework, cost breakdown, and performance history |

### Optimization (4 tools)
| Tool | Description |
|------|-------------|
| `metrx_get_optimization_recommendations` | AI-powered cost optimization recommendations per agent or fleet-wide |
| `metrx_apply_optimization` | One-click apply an optimization recommendation to an agent |
| `metrx_route_model` | Model routing recommendation for a specific task based on complexity |
| `metrx_compare_models` | Compare LLM model pricing and capabilities across providers |

### Budgets (3 tools)
| Tool | Description |
|------|-------------|
| `metrx_get_budget_status` | Current status of all budget configurations with spend vs. limits |
| `metrx_set_budget` | Create or update a budget with hard, soft, or monitor enforcement |
| `metrx_update_budget_mode` | Change enforcement mode of an existing budget or pause/resume it |

### Alerts (3 tools)
| Tool | Description |
|------|-------------|
| `metrx_get_alerts` | Active alerts and notifications for your agent fleet |
| `metrx_acknowledge_alert` | Mark one or more alerts as read/acknowledged |
| `metrx_get_failure_predictions` | Predictive failure analysis — identify agents likely to fail before it happens |

### Experiments (3 tools)
| Tool | Description |
|------|-------------|
| `metrx_create_model_experiment` | Start an A/B test comparing two LLM models with traffic splitting |
| `metrx_get_experiment_results` | Statistical significance, cost delta, and recommended action |
| `metrx_stop_experiment` | Stop a running model routing experiment and lock in the winner |

### Cost Leak Detector (1 tool)
| Tool | Description |
|------|-------------|
| `metrx_run_cost_leak_scan` | Comprehensive 7-check cost leak audit across your entire agent fleet |

### Attribution (3 tools)
| Tool | Description |
|------|-------------|
| `metrx_attribute_task` | Link agent actions to business outcomes for ROI tracking |
| `metrx_get_task_roi` | Calculate return on investment for an agent — costs vs. attributed outcomes |
| `metrx_get_attribution_report` | Multi-source attribution report with confidence scores and top contributors |

### Alert Configuration (1 tool)
| Tool | Description |
|------|-------------|
| `metrx_configure_alert_threshold` | Set cost or operational alert thresholds with email, webhook, or auto-pause |

### ROI Audit (1 tool)
| Tool | Description |
|------|-------------|
| `metrx_generate_roi_audit` | Board-ready ROI audit report for your AI agent fleet |

### Upgrade Justification (1 tool)
| Tool | Description |
|------|-------------|
| `metrx_get_upgrade_justification` | ROI report for tier upgrades based on current usage patterns |

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
→ metrx_compare_models(models=["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"])

Model Comparison (per 1M tokens):
├── gpt-4o: $2.50 in / $10.00 out
├── claude-3-5-sonnet: $3.00 in / $15.00 out
└── gemini-1.5-pro: $3.50 in / $10.50 out
```

### "Test a cheaper model"

```
User: Test Claude 3.5 Sonnet against my GPT-4 setup
→ metrx_create_model_experiment(agent_id="agent_123",
    model_a="gpt-4o", model_b="claude-3-5-sonnet-20241022", traffic_split=10)

Experiment started: 90% GPT-4o, 10% Claude 3.5 Sonnet
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
