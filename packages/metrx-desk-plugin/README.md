# metrx-desk (Claude Code plugin)

The Metrx manager's desk inside Claude Code: review the AI agents a company
employs the way a line manager reviews a team. Every number carries a label
(measured, owner-declared, advisory, insufficient data, synthetic), every
change is a candidate with its evidence, and every decision goes on record.

## Install

```
claude plugin marketplace add metrxbots/mcp-server
claude plugin install metrx-desk@metrxbots
```

Then, in Claude Code:

| Command                          | What it does                                                      | Needs a key |
| -------------------------------- | ----------------------------------------------------------------- | ----------- |
| `/metrx-desk:sample-review`      | The Northwind sample review (synthetic demo data)                 | No          |
| `/metrx-desk:draft-job-contract` | Draft a job contract for one agent from a template                | No          |
| `/metrx-desk:check-vendor-bill`  | Reconcile an AI vendor's per-resolution bill against your records | No          |
| `/metrx-desk:connect-metrx`      | Point the desk at your own agents (API key, first events)         | Creates one |
| `/metrx-desk:weekly-decisions`   | Your decision queue, and record what you decide                   | Yes         |

## Configuration

The plugin's `.mcp.json` connects to the hosted Metrx MCP server with the
workforce tool set. Two environment variables, both optional:

- `METRX_API_KEY`: a Metrx API key (`Settings → Security` in the dashboard).
  Without it the public tools answer on the demo; with it the same tools read
  your own organization. Restart Claude Code after setting it.
- `METRX_MCP_URL`: override the server URL (self-hosted or staging).

## Tools behind the skills

`metrx_get_workforce_review`, `metrx_get_scorecard`, `metrx_draft_job_contract`,
`metrx_check_vendor_bill`, `metrx_record_decision`, `metrx_get_job_contract`,
`metrx_set_job_contract`, `metrx_get_decision_queue`, `metrx_get_cost_summary`. The hosted
registry at https://metrxbot.com/.well-known/agent-card.json is the
authoritative list; the error classes are documented at
https://docs.metrxbot.com/desk#errors.

## Development

The plugin source lives in the Metrx monorepo at `packages/metrx-desk-plugin`
and is mirrored into https://github.com/metrxbots/mcp-server by
`packages/mcp-server/scripts/publish-mirror.ts`. Skill texts are held to the
Metrx claim gate by `apps/web/tests/desk-plugin.test.ts`.
