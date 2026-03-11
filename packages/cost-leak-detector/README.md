# @metrxbot/cost-leak-detector

> Part of the [Metrx MCP Server](https://github.com/metrxbots/mcp-server) monorepo.

Find wasted AI spend — free, local, no cloud needed.

**Cost Leak Detector** is a lightweight CLI tool that scans your LLM API logs and OpenTelemetry spans to identify expensive behaviors and waste. Run it locally. No signup. No cloud services. No data leaves your machine.

## Features

- **7 Cost Leak Checks** — Detect idle agents, premium models for simple tasks, missing caching, high error rates, context overflow, missing budgets, and cross-provider arbitrage
- **Works Offline** — Analyze your spans locally without uploading data
- **Multiple Input Formats** — Support for OpenTelemetry JSON exports and CSV logs
- **Pricing Database** — Built-in pricing for GPT-4, Claude, Gemini, Llama, and more
- **Flexible Output** — JSON or human-readable table format
- **Zero Dependencies** — Only `commander` for CLI; no heavy frameworks

## Quick Start

### Using npx (no install required)

```bash
# Scan your OTEL export or CSV log
npx @metrxbot/cost-leak-detector scan --input otel-export.json

# See the demo
npx @metrxbot/cost-leak-detector demo
```

### Local Installation

```bash
npm install -D @metrxbot/cost-leak-detector
npx metrx-leak-detect scan --input spans.json
```

### Programmatic Use

```typescript
import { analyzeCosts, parseOtelExport } from '@metrxbot/cost-leak-detector';

const spans = parseOtelExport('otel-export.json');
const report = analyzeCosts(spans);

console.log(`Estimated waste: $${report.summary.totalEstimatedMonthlyWaste}`);
```

## Usage

### Scan Command

Analyze OTEL spans or proxy logs:

```bash
metrx-leak-detect scan \
  --input spans.json \
  --format auto \
  --output-format table \
  --output report.txt
```

**Options:**

- `--input <file>` _(required)_ — Path to OTEL JSON export or CSV log
- `--format <format>` — `auto`, `otel`, or `csv` (default: `auto`)
- `--output-format <format>` — `table` or `json` (default: `table`)
- `--output <file>` — Save output to file (default: stdout)

### Demo Command

See the tool in action with sample data:

```bash
metrx-leak-detect demo
metrx-leak-detect demo --output-format json
```

## The 7 Cost Leak Checks

### 1. **Idle Agents Running** (High Severity)

Agents that continue running but generate zero successful completions waste input tokens daily.

**Example:** Agent ran 24/7 for a week, failed every call → ~$500 wasted.

**Fix:** Kill the agent or debug configuration. Add health checks and auto-scaling.

### 2. **Premium Models for Simple Tasks** (High Severity)

Using GPT-4 or Claude 3 Opus for responses under 100 tokens is cost-inefficient.

**Example:** 1000 calls to GPT-4 returning 50 tokens each → ~$15 waste on model cost alone.

**Fix:** Use model routing. Route simple tasks to gpt-4o-mini or Claude 3 Haiku.

### 3. **Missing Response Caching** (Medium Severity)

Identical prompts asked multiple times within an hour waste output tokens.

**Example:** FAQ question asked 5 times → output tokens regenerated 5x.

**Fix:** Implement prompt caching (Anthropic) or add response memoization layer.

### 4. **High Error Rates** (Critical Severity)

Each error call costs input tokens with zero useful output. >10% error rate is a leak.

**Example:** 100 API calls, 15 fail → $2 spent on failed inputs.

**Fix:** Add input validation. Handle rate limits gracefully. Log error root causes.

### 5. **Context Window Overflow Risk** (Medium Severity)

When context usage regularly exceeds 60%, you risk hitting limits and losing data.

**Example:** 1000-token context window at 80% utilization → risk of pruning.

**Fix:** Switch to larger context models (Gemini 1.5 Pro, Claude 3.5) or implement RAG.

### 6. **No Budget Limits Set** (Medium Severity)

Running without per-agent or per-project budget caps enables runaway costs.

**Example:** Bug in agent loop → $5k spend before human notice.

**Fix:** Set API quotas, per-agent budgets, and rate limits. Monitor spend in real-time.

### 7. **Cross-Provider Arbitrage Opportunity** (Low Severity)

Same task running on different providers with >30% cost variance can be consolidated.

**Example:** Summarization task costs $10 on GPT-4 but $3 on Claude 3 Haiku.

**Fix:** Route tasks to the cheapest qualified provider. Build a cost-aware router.

## Input Formats

### OpenTelemetry JSON Export

Export spans from your OTEL collector or instrumented app:

```json
[
  {
    "traceId": "trace-123",
    "spanId": "span-456",
    "name": "llm_call",
    "startTimeUnixNano": 1704067200000000000,
    "endTimeUnixNano": 1704067203000000000,
    "attributes": {
      "llm.model": "gpt-4",
      "llm.input_tokens": 500,
      "llm.output_tokens": 150,
      "agent_id": "agent-001"
    },
    "status": { "code": "OK" }
  }
]
```

### CSV Log Format

Simple CSV with one call per row:

```csv
timestamp,model,input_tokens,output_tokens,status,agent_id
2024-01-01T12:00:00Z,gpt-4,500,150,ok,agent-001
2024-01-01T12:00:05Z,gpt-4,400,200,error,agent-001
2024-01-01T12:00:10Z,claude-3-opus,1000,300,ok,agent-002
```

Supported columns: `timestamp`, `model`, `input_tokens`, `output_tokens`, `status`, `agent_id`, `budget_limit_usd`, `context_usage_percent`, `prompt`, `trace_id`, `span_id`, `operation`.

## Output Format

### Table (Human-Readable)

```
╔════════════════════════════════════════════════════════════════════════════════╗
║                    METRX COST LEAK DETECTION REPORT                           ║
╚════════════════════════════════════════════════════════════════════════════════╝

SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Spans Analyzed:           150
Critical Issues:                1
High Priority Issues:           2
Estimated Monthly Waste:        $1,245.50
Report Generated:               2024-01-01 12:00:00

FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. [🔴 CRITICAL] High Error Rates

   Finding:
   15% of API calls failed (22/150). Each error wastes input tokens with no output.

   Estimated Monthly Waste: $450.00

   Recommendation:
   Investigate root causes: invalid inputs, rate limits, malformed requests. Add
   input validation and error recovery.
```

### JSON

```json
{
  "totalSpans": 150,
  "analysisTimestamp": "2024-01-01T12:00:00.000Z",
  "findings": [
    {
      "checkName": "High Error Rates",
      "severity": "critical",
      "finding": "15% of API calls failed (22/150)...",
      "estimatedMonthlyWasteUsd": 450.0,
      "recommendation": "Investigate root causes..."
    }
  ],
  "summary": {
    "totalEstimatedMonthlyWaste": 1245.5,
    "criticalIssues": 1,
    "highPriorityIssues": 2
  }
}
```

## Real-Time Optimization

This tool is perfect for one-time audits. For **continuous optimization**, upgrade to Metrx:

- **Real-time dashboards** — Watch your spend live
- **Smart recommendations** — ML-driven suggestions tailored to your workload
- **Auto-optimization** — Automatic model routing, caching, and cost control
- **Team insights** — See which agents/teams burn the most cost

**Visit [metrxbot.com](https://metrxbot.com)** to set up real-time monitoring and let AI help you save.

## Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Run tests
npm run test

# Development mode (use tsx)
npm run dev -- demo
```

## API Reference

### `analyzeCosts(spans: Span[]): CostAnalysisReport`

Run all 7 checks on a set of spans.

```typescript
import { analyzeCosts } from '@metrxbot/cost-leak-detector';

const report = analyzeCosts(spans);
```

### `parseOtelExport(filePath: string): Span[]`

Parse OTEL JSON export.

```typescript
import { parseOtelExport } from '@metrxbot/cost-leak-detector';

const spans = parseOtelExport('otel-export.json');
```

### `parseCsvLog(filePath: string): Span[]`

Parse CSV log file.

```typescript
import { parseCsvLog } from '@metrxbot/cost-leak-detector';

const spans = parseCsvLog('logs.csv');
```

### `getPricing(modelName: string): ModelPricing`

Look up pricing for a model.

```typescript
import { getPricing } from '@metrxbot/cost-leak-detector';

const pricing = getPricing('gpt-4o');
// { inputTokenCost: 5, outputTokenCost: 15 }
```

### `calculateSpanCost(inputTokens, outputTokens, modelName): number`

Calculate cost of a single span.

```typescript
import { calculateSpanCost } from '@metrxbot/cost-leak-detector';

const cost = calculateSpanCost(1000, 500, 'gpt-4');
```

## Pricing Data

The tool includes built-in pricing for:

**OpenAI:** gpt-4, gpt-4-turbo, gpt-4o, gpt-4o-mini, gpt-3.5-turbo

**Anthropic:** claude-3-opus, claude-3-sonnet, claude-3.5-sonnet, claude-3-haiku, claude-3.5-haiku

**Google:** gemini-1.5-pro, gemini-1.5-flash, gemini-pro

**Meta:** llama-3-70b, llama-3-8b, llama-2-70b

**Mistral:** mistral-large, mistral-medium, mistral-small

Pricing data is updated regularly. For latest pricing, check official provider docs.

## License

MIT

---

**Found a leak? Ready to fix it?** — [metrxbot.com](https://metrxbot.com)
