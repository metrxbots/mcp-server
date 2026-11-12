# metrx (Codex plugin)

Connects Codex to your Metrx organisation through the OAuth connector at
`https://metrxbot.com/api/mcp/connect`. Codex registers itself with the Metrx
sign-in server (dynamic client registration) and you sign in with your Metrx
account; no API key is copied into Codex.

Install from this repository's marketplace:

```bash
codex plugin marketplace add metrxbots/mcp-server
codex plugin add metrx@metrxbots
```

Sign in to Metrx when Codex asks.

What the connector can do, and what it cannot (API-key management, billing,
outcome ingest stay key-only): https://docs.metrxbot.com/connect

Two manifest contracts ship side by side, describing the same server:

- `plugin.json` + `mcp.json`: the portable format in the current Codex docs.
- `.codex-plugin/plugin.json` + `.mcp.json`: what the Codex CLI ingests today
  (codex-cli 0.152.1's own validator requires it; `.mcp.json` takes no other
  top-level key).

`publish-mirror.ts --check` keeps names, versions and the server definition in
step across both.
