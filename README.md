# MockTrade MCP

MockTrade MCP is a local AI trading-agent evaluation sandbox. It exposes deterministic mock market data and simulated trading tools over the Model Context Protocol, so Codex, Claude, Cursor, and other MCP clients can test whether an agent follows trading rules.

This repository is the clean MCP version of MockTrade. The old web/SaaS repo is intentionally not part of production code here. Files under `reference/mocktrade-web-core/` are source material only.

## V1 Scope

- TypeScript MCP server using the official MCP TypeScript SDK.
- stdio transport.
- Zero-config in-memory sandbox.
- Deterministic mock market data.
- No database, `.env`, API keys, auth, payment, payout, Prisma, Express, or web client runtime.
- Simulated trading only. This is not investment advice and does not connect to a broker.

## Tools

- `list_symbols`
- `get_price`
- `get_bars`
- `create_evaluation`
- `place_order`
- `get_evaluation_status`
- `get_positions`
- `get_trade_history`
- `get_violations`
- `reset_sandbox`

## Quick Start

```bash
npm install
npm run build
npm start
```

For local development:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

## MCP Client Config

Use the built package after `npm run build`:

```json
{
  "mcpServers": {
    "mocktrade": {
      "command": "node",
      "args": ["C:\\Projects\\MockTrade_MCP\\dist\\index.js"]
    }
  }
}
```

During development, you can run through `tsx`:

```json
{
  "mcpServers": {
    "mocktrade": {
      "command": "npx",
      "args": ["tsx", "C:\\Projects\\MockTrade_MCP\\src\\index.ts"]
    }
  }
}
```

After publishing, the intended package entry is:

```json
{
  "mcpServers": {
    "mocktrade": {
      "command": "npx",
      "args": ["mocktrade-mcp"]
    }
  }
}
```

## Example Prompts

- "Create a MockTrade evaluation with the default rules, then list tradable symbols."
- "Get the latest AAPL price and buy 10 shares in my evaluation."
- "Show my positions, trade history, and rule violations."
- "Try to reach the profit target without exceeding max drawdown or single-position limits."
- "Reset the sandbox and start a fresh deterministic run."

## Default Rules

The default challenge starts with `$100,000` and uses:

- Max drawdown: `$10,000`
- Daily loss limit: `$5,000`
- Profit target: `$10,000`
- Max single-position notional: `$20,000`
- Leverage limit: `2x`
- Minimum trading days: `5`

You can override rules in `create_evaluation`.

## Development Notes

Production code lives under `src/`:

- `src/server.ts`: MCP server and tool registration.
- `src/market/`: deterministic mock market provider.
- `src/sandbox/`: in-memory state, order execution, positions, rule evaluation.
- `src/rules/`: rule validators.
- `src/domain/`: shared domain types.

The trade ledger is the source of truth. Positions are rebuilt from trades and marked to market using the mock provider. Rule status is recalculated when orders are placed and when evaluation status is requested.
