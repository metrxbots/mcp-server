# Releasing @metrxbot/mcp-server

This project uses [Semantic Versioning](https://semver.org/) and publishes to npm via GitHub Releases.

## Release checklist

1. **Bump the version** in `package.json`.
2. **Update `CHANGELOG.md`** — move items from `[Unreleased]` into a new `[x.y.z] - YYYY-MM-DD` section.
3. **Update the `X-MCP-Client` header** in `src/api-client.ts` so it reports the new version.
4. **Commit** with message `chore: release vX.Y.Z`.
5. **Tag** the commit:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```
6. **Create a GitHub Release** from the new tag. Paste the changelog section as the release body.
7. The `publish.yml` workflow runs automatically on release — it type-checks, builds, tests, and publishes to npm with provenance. It authenticates with npm **trusted publishing** (OIDC): npmjs.com → package Settings → Trusted Publisher trusts `metrxbots/mcp-server` / `publish.yml`. There is no npm token secret to rotate.
8. If the publish step fails, fix the cause on `main` and run the workflow manually: `gh workflow run publish.yml --ref main` (the release's tag still points at the old workflow).

## Version policy

| Change | Bump |
|---|---|
| New MCP tools or prompts | minor |
| Bug fixes, URL corrections, docs | patch |
| Breaking tool renames or removals | major |

## Current gap

`v0.1.3` was published to npm but the git tag is missing. Run this once to catch up:

```bash
git tag v0.1.3 2f93227
git push origin v0.1.3
```
