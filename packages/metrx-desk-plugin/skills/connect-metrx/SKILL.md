---
name: connect-metrx
description: Point the Metrx desk at the company's own AI agents. Walks through creating a Metrx API key, setting METRX_API_KEY for this plugin, restarting Claude Code, and reading the first review of real data. Use after the sample review, or whenever a desk tool answers auth_required.
---

# Connect your own agents

The desk reads your own organization through a Metrx API key. Without one,
the same tools answer on the Northwind sample (synthetic demo data).

## Steps

1. Ask whether the person already has a Metrx account. If not, the sign-up
   is at https://metrxbot.com/sign-up. Do not create the account or sign
   in for them.
2. Creating the key: in the Metrx dashboard open **Settings → Security**
   and create an API key. For the review and the queue the key needs the
   `read` scope; to record decisions it needs `write`; to publish a job
   contract it needs `admin`. Keys start with `sk_live_`. Tell them to copy
   it once; Metrx shows it once.
3. Setting the key for this plugin. The plugin's server entry reads
   `METRX_API_KEY` from the environment Claude Code was started in. Tell
   them to add it to their shell profile (or the environment of the
   process that launches Claude Code), for example:

   ```
   export METRX_API_KEY=sk_live_...
   ```

   Never ask them to paste the key into the chat, and never echo a key
   back. If they do paste one, do not repeat it.

4. Restart Claude Code. MCP servers read their environment at start, so
   the key is not seen until then.
5. Verify: call `metrx_get_workforce_review` with `{ "org": "me" }`.
   - `auth_required`: the key is not reaching the server. Check the
     variable name, the restart, and that the key starts with `sk_live_`.
   - `insufficient_scope`: the key lacks `read`. Create one with it.
   - A document with `state` other than `ok`: relay its `state_message`.
     `no_events` means no agent has sent anything yet; `no_outcomes` means
     events arrive but no outcome has been confirmed; `timeout` means part
     of the read missed its deadline and the next read fills it in. Each
     message says what to do next.
   - A document with `state: "ok"`: relay it as `/metrx-desk:sample-review`
     does, labels included, and say the review page for their org is in
     the dashboard.
6. Sending the first events: agents connect through the Python SDK, the
   TypeScript SDK or OpenTelemetry; the snippets are at
   https://metrxbot.com/agent-quickstart. Confirmed outcomes come from the
   SDK's outcome call or from a review signal; without them the cost per
   confirmed outcome stays "insufficient data", which is the honest state.

## Rules

- The person's key is theirs. Do not read, print, store or transmit it
  anywhere but the environment variable they set.
- Do not promise a result from connecting. Connecting makes the numbers
  measurable; it does not change them.
