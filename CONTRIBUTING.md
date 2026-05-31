# Contributing

Thanks for your interest in MockTrade MCP.

## Development

```bash
npm install
npm run build
npm test
```

Use `npm run dev` to run the MCP server from TypeScript during local development.

## Project Boundaries

MockTrade MCP should stay local-first and lightweight:

- No required database.
- No required API keys.
- No broker execution.
- No auth, payments, payouts, or web app runtime.
- Default behavior should work with deterministic mock data.

Optional providers such as Alpaca and Polygon must remain opt-in.

## Pull Requests

Before opening a PR:

```bash
npm run ci
npm run pack:dry-run
```

Keep changes focused. Include tests for trading rules, replay behavior, market-data loading, or MCP tool schema changes.

## Security

Do not commit real API keys, `.env` files, real account data, or proprietary historical datasets. Local CSV files under `data/historical/*.csv` are intentionally ignored.
