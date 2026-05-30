# MockTrade MCP

Standalone MCP version of MockTrade, intended to become an open-source local trading-agent evaluation sandbox.

This repo should stay separate from the original web/SaaS version. The copied code under `reference/mocktrade-web-core/` is only reference material from the current website repo. The MCP implementation should be built as a clean package, with a new `src/` layout and no dependency on the old client, auth, payout, Prisma, or Express runtime by default.

## Target V1

- Run locally with `npx mocktrade-mcp`.
- Expose MCP tools over stdio.
- Use deterministic mock market data by default.
- Use in-memory sandbox state by default.
- Let Codex, Claude, Cursor, and other MCP clients create evaluations, place simulated orders, inspect positions, and get PASS/FAIL rule status.

## What Was Copied

- Trading and evaluation engines for reference.
- Rule validators and rule types.
- Market data provider abstractions and mock/Alpaca providers.
- Constants, DTOs, PnL utility, and related unit tests.

## What Was Intentionally Not Copied

- `client/` React app.
- Express routes and auth runtime.
- Prisma schema/migrations/repositories.
- Payout/payment logic.
- `server/dist/` build artifacts.
- Old website README/docs.
- Old git history.
