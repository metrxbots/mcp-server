# Metrx MCP Server

<!-- mcp-name: com.metrxbot/mcp-server -->

[![npm version](https://img.shields.io/npm/v/@metrxbot/mcp-server)](https://www.npmjs.com/package/@metrxbot/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The **Model Context Protocol (MCP) server** for [Metrx](https://metrxbot.com): how a company manages the AI agents it employs. Each agent gets a job contract, a scorecard against it, and a P&L: what it cost and what it produced. This server exposes those records as tools that any MCP-compatible client (Claude, GPT, Gemini, custom agents) can call. Version 0.5.0.

This package is the single source for both transports: the npm package you run locally over stdio, and the hosted server at `https://metrxbot.com/api/mcp`. The public repository at https://github.com/metrxbots/mcp-server is a mirror, synced from the monorepo by `packages/mcp-server/scripts/publish-mirror.ts`. Contributors open pull requests against the monorepo; issues go to https://github.com/metrxbots/mcp-server/issues.

## Quick Start

Three ways in.

**1. The demo, no key.** The public desk tools answer on the Northwind sample organization, which is synthetic demo data.

```bash
npx @metrxbot/mcp-server --demo
```

**2. Interactive login.** Opens the browser, saves the key locally, then verifies it.

```bash
npx @metrxbot/mcp-server --auth
npx @metrxbot/mcp-server --test
```

**3. A key in the environment.**

```bash
METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server
```

`npx @metrxbot/mcp-server --setup-claude` writes the server entry into the Claude Desktop, Cursor or VS Code config for you.

## Claude Code plugin

The desk plugin wraps the workforce tool set in five skills.

```bash
claude plugin marketplace add metrxbots/mcp-server && claude plugin install metrx-desk@metrxbots
```

Versions: this server is 0.5.0 (`@metrxbot/mcp-server`). The desk plugin (`metrx-desk`) and the TypeScript SDK (`@metrxbot/sdk`) are separate artefacts with their own version numbers and release schedules; each states its version in its own package.

| Command                          | What it does                                                                                                                                                                           | Needs a key                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `/metrx-desk:sample-review`      | The Northwind sample review (synthetic demo data), relayed with every figure's label                                                                                                   | No                          |
| `/metrx-desk:draft-job-contract` | Draft a job contract for one agent from a template (support_triage, sdr_qualification, internal_assistant, coding_patch); owner is required; publishing is a separate admin-scope step | No                          |
| `/metrx-desk:check-vendor-bill`  | Reconcile a per-resolution vendor bill against your own records: matched, disputed, unmatched, outside coverage, with the disputed amount                                              | No                          |
| `/metrx-desk:connect-metrx`      | Create a key at Settings → Security, set METRX_API_KEY, restart, read your first review                                                                                                | Creates one                 |
| `/metrx-desk:weekly-decisions`   | Your decision queue; record expand, re_specify, combine or retire with a rationale                                                                                                     | Yes (read; write to record) |

The full walkthrough, including the labels every figure carries and the plain HTTP routes, is at https://docs.metrxbot.com/desk.

## Tools

The tool registry is published at https://metrxbot.com/.well-known/agent-card.json: names, descriptions, domains, the public subset that answers without a key, and the named tool sets. That file is the authoritative list; this README does not repeat it. Every tool's description ends with the scope it needs (`read`, `write` or `admin`).

Tool names carry the `metrx_` prefix. The desk's public tools are `metrx_get_workforce_review`, `metrx_draft_job_contract` and `metrx_check_vendor_bill`. Signed-in desk tools include `metrx_get_decision_queue`, `metrx_record_decision`, `metrx_get_scorecard`, `metrx_get_job_contract` and `metrx_set_job_contract`; cost reads such as `metrx_get_cost_summary` sit alongside them. A job contract is recorded, not enforced at runtime: publishing one blocks no spend or traffic.

## Guided Prompts

MCP prompts are templates that walk a client through a multi-step workflow.

#### `analyze-costs`

Fetches the cost summary, lists agents, gets optimization recommendations and returns a prioritized breakdown.

**Arguments:**

- `period_days` (string, optional): number of days to analyze (default: "30")

#### `find-savings`

Checks recommendations, runs the cost leak scan and explains each finding in dollars.

**Arguments:** none

#### `cost-leak-scan`

Runs the waste audit: retry storms, oversized contexts, model mismatch, missing caching, idle agents, missing budgets, arbitrage gaps.

**Arguments:**

- `agent_id` (string, optional): scan one agent by UUID, or omit to scan all

## Installation

### From npm

```bash
npm install @metrxbot/mcp-server
```

### Quick Test

Verify your API key and connection:

```bash
METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server --test
```

## Configuration

### Environment Variables

- **`METRX_API_KEY`** (optional for `--demo`, required otherwise): your Metrx API key. Create one at https://app.metrxbot.com/settings/security
- **`METRX_API_URL`** (optional): override the API base URL (default: `https://app.metrxbot.com/api`)

### Hosted transport

The same registry is served over streamable HTTP at `https://metrxbot.com/api/mcp`. Add `?set=workforce` to select the desk tool set. The `Authorization: Bearer sk_live_...` header is optional: without it the public tools answer on the demo (synthetic demo data).

```json
{
  "mcpServers": {
    "metrx": {
      "type": "http",
      "url": "https://metrxbot.com/api/mcp?set=workforce",
      "headers": { "Authorization": "Bearer sk_live_your_key_here" }
    }
  }
}
```

### MCP Client Setup (stdio)

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

#### Cursor

Add to `~/.cursor/mcp.json`:

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

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

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

Or run directly:

```bash
METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server
```

## Rate Limiting

The stdio server enforces per-tool-category rate limits:

| Category           | Limit                |
| ------------------ | -------------------- |
| Dashboard & Agents | 60 requests/minute   |
| Metrics            | 30 requests/minute   |
| Experiments        | 10 requests/minute   |
| Budgets            | 10 requests/minute   |
| Alerts             | 10 requests/minute   |
| Attribution        | 10 requests/minute   |
| Optimization       | 5 requests/minute    |
| Cost Leak Scan     | 2 requests/5 minutes |
| Default (other)    | 30 requests/minute   |

The public desk routes are limited per address at 30 requests per minute; the limit rides in the `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers. Hitting a limit returns an error with the retry-after time in seconds.

For high-volume use, contact support@metrxbot.com.

## Error Handling

Every refusal carries a class. Over MCP it is a JSON-RPC error with `data.class`, `data.doc` and `data.user_message`; over HTTP it is an RFC 9457 problem body with `Retry-After` on the retryable classes.

| Class                 | JSON-RPC code | HTTP status | Doc                                                       |
| --------------------- | ------------- | ----------- | --------------------------------------------------------- |
| `auth_required`       | -32001        | 401         | https://docs.metrxbot.com/desk#errors-auth-required       |
| `insufficient_scope`  | -32002        | 403         | https://docs.metrxbot.com/desk#errors-insufficient-scope  |
| `rate_limited`        | -32003        | 429         | https://docs.metrxbot.com/desk#errors-rate-limited        |
| `limiter_unavailable` | -32004        | 503         | https://docs.metrxbot.com/desk#errors-limiter-unavailable |
| `demo_unavailable`    | -32005        | 503         | https://docs.metrxbot.com/desk#errors-demo-unavailable    |
| `unknown_agent_key`   | -32006        | 404         | https://docs.metrxbot.com/desk#errors-unknown-agent-key   |
| `invalid_params`      | -32602        | 400         | https://docs.metrxbot.com/desk#errors-invalid-params      |
| `transport_error`     | -32007        | 502         | https://docs.metrxbot.com/desk#errors-transport-error     |

Server errors from the upstream API (500 and above) are retried with exponential backoff, up to 3 times.

## Authentication

Requests to your own organization carry `METRX_API_KEY` in the Authorization header:

```
Authorization: Bearer sk_live_xxx
```

API keys are environment-scoped: `sk_live_*` for production, `sk_test_*` for testing, `mk_*` for machine keys.

Each key also carries scopes. Read tools need `read`; tools that change data need `write`; budget changes, publishing a job contract and creating an experiment need `admin`. An org owner or admin mints keys, including `admin`-scoped ones, in Settings → Security → API Keys.

## Testing

Verify your API key:

```bash
METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server --test
```

Run the test suite:

```bash
npm run test
```

Tests cover:

- Protocol compliance (MCP spec validation)
- Tool schema and input validation
- API client retry logic and error handling
- Rate limiting behavior
- Output formatting

## Troubleshooting

### "METRX_API_KEY environment variable is required"

Set the key before starting the server, or run `--demo` for the public tools:

```bash
export METRX_API_KEY=sk_live_your_key
npx @metrxbot/mcp-server
```

Create a key at https://app.metrxbot.com/settings/security, or run `npx @metrxbot/mcp-server --auth`.

### "Rate limit exceeded"

The error message includes a retry-after time in seconds. Your MCP client should retry after it. For production volume, contact support.

### "401 Unauthorized" or `auth_required`

Your API key is invalid, expired or missing. Create a new one at https://app.metrxbot.com/settings/security.

### `unknown_agent_key`

No agent in your organization has that `agent_key`. Check the Agents page in the dashboard; the error's `suggestions` lists close matches when there are any.

## Support

- **Docs**: https://docs.metrxbot.com (the desk: https://docs.metrxbot.com/desk)
- **API Status**: https://status.metrxbot.com
- **Email**: support@metrxbot.com
- **GitHub Issues**: https://github.com/metrxbots/mcp-server/issues

## License

MIT, see [LICENSE](./LICENSE).
