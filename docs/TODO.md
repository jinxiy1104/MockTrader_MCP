# TODO

## Bootstrap

- [ ] Create clean TypeScript package structure.
- [ ] Add official MCP TypeScript SDK.
- [ ] Add Zod for tool input schemas.
- [ ] Add build, dev, test, and start scripts.
- [ ] Add `bin` entry for future `npx mocktrade-mcp` usage.

## Sandbox Core

- [ ] Define clean MCP-domain types: Evaluation, Ruleset, Trade, Position, Violation, MarketPrice, MarketBar.
- [ ] Implement deterministic mock market provider.
- [ ] Implement in-memory evaluation store.
- [ ] Port order execution from reference trading engine without Prisma dependencies.
- [ ] Port mark-to-market and position rebuild logic.
- [ ] Port rule validation and pass/fail logic.
- [ ] Implement idempotent `clientOrderId` handling.

## MCP Tools

- [ ] Implement `list_symbols`.
- [ ] Implement `get_price`.
- [ ] Implement `get_bars`.
- [ ] Implement `create_evaluation`.
- [ ] Implement `place_order`.
- [ ] Implement `get_evaluation_status`.
- [ ] Implement `get_positions`.
- [ ] Implement `get_trade_history`.
- [ ] Implement `get_violations`.
- [ ] Implement `reset_sandbox`.

## Tests

- [ ] Unit test market determinism.
- [ ] Unit test buy/sell order execution.
- [ ] Unit test no naked shorting.
- [ ] Unit test position rebuild and realized/unrealized PnL.
- [ ] Unit test max drawdown failure.
- [ ] Unit test profit target pass.
- [ ] Integration test full MCP-like flow.

## Docs

- [ ] Rewrite README for open-source MCP users.
- [ ] Add Claude Desktop config example.
- [ ] Add Codex/Cursor-style config example if applicable.
- [ ] Add demo prompts for trading agents.
- [ ] Add disclaimer: simulated trading only, no investment advice, no broker execution.
