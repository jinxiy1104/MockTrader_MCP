# TODO

## Bootstrap

- [x] Create clean TypeScript package structure.
- [x] Add official MCP TypeScript SDK.
- [x] Add Zod for tool input schemas.
- [x] Add build, dev, test, and start scripts.
- [x] Add `bin` entry for future `npx mocktrade-mcp` usage.

## Sandbox Core

- [x] Define clean MCP-domain types: Evaluation, Ruleset, Trade, Position, Violation, MarketPrice, MarketBar.
- [x] Implement deterministic mock market provider.
- [x] Implement in-memory evaluation store.
- [x] Port order execution from reference trading engine without Prisma dependencies.
- [x] Port mark-to-market and position rebuild logic.
- [x] Port rule validation and pass/fail logic.
- [x] Implement idempotent `clientOrderId` handling.

## MCP Tools

- [x] Implement `list_symbols`.
- [x] Implement `get_price`.
- [x] Implement `get_bars`.
- [x] Implement `create_evaluation`.
- [x] Implement `place_order`.
- [x] Implement `get_evaluation_status`.
- [x] Implement `get_positions`.
- [x] Implement `get_trade_history`.
- [x] Implement `get_violations`.
- [x] Implement `reset_sandbox`.

## Tests

- [x] Unit test market determinism.
- [x] Unit test buy/sell order execution.
- [x] Unit test no naked shorting.
- [x] Unit test position rebuild and realized/unrealized PnL.
- [x] Unit test max drawdown failure.
- [x] Unit test profit target pass.
- [x] Integration test full MCP-like flow.

## Docs

- [x] Rewrite README for open-source MCP users.
- [x] Add Claude Desktop config example.
- [x] Add Codex/Cursor-style config example if applicable.
- [x] Add demo prompts for trading agents.
- [x] Add disclaimer: simulated trading only, no investment advice, no broker execution.
