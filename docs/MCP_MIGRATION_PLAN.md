# MCP Migration Plan

## Summary

Build MockTrade MCP as a clean standalone repo: an AI Trading Agent Evaluation MCP server. V1 should be local-first, zero-config, stdio-based, and use deterministic mock market data with in-memory account state.

The old website repo is now frozen as the web/SaaS version. This repo should not import or preserve the web repo structure wholesale. Use `reference/mocktrade-web-core/` only as source material.

## Key Decisions

- Product positioning: Agent evaluation sandbox.
- Runtime: local one-command MCP server.
- Transport: stdio for V1.
- Storage: in-memory for V1.
- Market data: deterministic mock provider by default.
- Optional real market data: Alpaca later, requiring user-provided API keys.
- Out of scope for V1: website UI, auth, payment, payout, real broker execution, hosted service.

## V1 MCP Tools

- `list_symbols()`
- `get_price({ symbol })`
- `get_bars({ symbol, interval, limit })`
- `create_evaluation({ challengeName?, initialBalance?, rules? })`
- `place_order({ evaluationId, symbol, side, quantity, clientOrderId? })`
- `get_evaluation_status({ evaluationId })`
- `get_positions({ evaluationId })`
- `get_trade_history({ evaluationId, limit? })`
- `get_violations({ evaluationId })`
- `reset_sandbox()`

## Implementation Shape

- Create a fresh `src/` tree for MCP code.
- Use official MCP TypeScript SDK and Zod input schemas.
- Build a `sandbox` layer independent of Prisma:
  - in-memory evaluations
  - in-memory trades ledger
  - in-memory positions
  - in-memory violations
  - deterministic market state
- Port only the business logic needed from `reference/mocktrade-web-core`.
- Keep old reference imports out of production code.
- Ensure logs go to stderr so stdout remains valid MCP protocol output.

## Acceptance Criteria

- `npm install && npm run build` works.
- `npm test` works.
- MCP server starts without `.env`, database, API keys, or Docker.
- A connected agent can create an evaluation, fetch prices, place orders, query positions, and get rule status.
- README gives copy-paste config examples for Claude/Codex-style MCP clients.
