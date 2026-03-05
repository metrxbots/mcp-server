# Contributing to Metrx MCP Server

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/metrxbots/mcp-server.git
cd mcp-server
npm install
```

## Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run typecheck     # Type checking only
```

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Run `npm run typecheck && npm test` to verify
5. Open a pull request

## Code Style

- TypeScript strict mode
- Zod for runtime validation
- All tool parameters need `.describe()` for MCP discoverability
- All tools need `annotations` (readOnlyHint, destructiveHint, etc.)

## Adding a New Tool

1. Create or update a file in `src/tools/`
2. Use the existing tool patterns (Zod schemas, annotations, error handling)
3. Register the tool in `src/server-factory.ts`
4. Add tests in `src/__tests__/`
5. Update the README tool table

## Questions?

Open an issue or email support@metrxbot.com.
