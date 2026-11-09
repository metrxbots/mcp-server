---
name: sample-review
description: Read the Northwind sample workforce review (synthetic demo data, no account needed) and relay it the way a line manager would read it. Use when someone wants to see what Metrx does before connecting their own agents.
---

# Sample review

You are showing a manager what a Metrx workforce review looks like, on the
public Northwind sample. Northwind is a synthetic organization. Say so in
the first line and keep the words "Synthetic demo data" visible wherever
you show a Northwind number.

## Steps

1. Call the `metrx_get_workforce_review` tool with `{ "org": "demo" }`. Do not
   pass a key for this call; the demo needs none.
2. If the tool returns an error with class `demo_unavailable`, relay its
   `user_message` verbatim and stop. If the class is `rate_limited`, relay
   the `user_message` and the `retry_after_seconds`, then stop. If the class
   is `limiter_unavailable`, relay the `user_message` and stop (it carries
   no `retry_after_seconds`). Never invent numbers to fill the gap.
3. From the document, relay in this order, keeping each figure's label word
   (`measured`, `owner-declared`, `advisory`, `insufficient data`,
   `synthetic`) next to the figure. Never drop a label to make a sentence
   read better.
   - **This period**: agents, spend (with `spend_label`), events, tasks,
     confirmed outcomes, and cost per confirmed outcome. When
     `cost_per_confirmed_usd` is null, write "insufficient data", not a
     number. If `human_baseline_usd` is present, put it beside the cost per
     confirmed outcome and name it owner-declared.
   - **What to change**: each candidate as one line: the `rule`, the
     agents it names (`agent_keys`), `n` against `threshold` with the
     `count_label`, `money_usd` (a figure or the words "insufficient
     data") with the `money_label` and what the figure is (for
     `idle_agent` the job contract's declared budget per month, for
     `model_swap` the proposal's savings per month; never a bare dollar
     amount), and the `proof` kind (`model_swap`
     runs as a trial; `decision` is a line on the record). When the
     candidate's last field (what would make its figure firm) is set, add
     it as the next step.
   - **The roster**: the top rows in the order the document gives them
     (spend descending). Team and owner print as "unassigned" when null.
     Each row's scorecard state in one word.
   - **Decisions on record**: each decision as kind, agent, date.
4. End with the document's `next_steps` text, verbatim, followed by the
   trailer below. This trailer is fixed; do not reword it.

```
claude plugin marketplace add metrxbots/mcp-server
claude plugin install metrx-desk@metrxbots
```

To run it on your own agents:

1. Mint a read key at /settings/security in the Metrx dashboard.
2. export METRX_API_KEY=<your read key>
3. Restart your MCP client so it picks up the key.
4. Run /metrx-desk:connect-metrx.

The key lives under Settings → Security; `/metrx-desk:connect-metrx` walks
through it. `/metrx-desk:weekly-decisions` then shows your own queue once
events land.

## Rules

- Relay the document; do not summarize it into a verdict about Northwind.
- No percentage, saving, or ROI that is not literally in the document with
  its label.
- Three lines about the page are enough when the person only asked what
  Metrx is: cost per confirmed outcome beside a human baseline, one change
  with its money and label, and how a decision goes on record.
