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

Core sandbox tools:

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

Replay/backtest tools:

- `create_replay_evaluation`
- `get_visible_bars`
- `advance_time`
- `get_replay_status`
- `get_pnl_report`

## Quick Start

From Git Bash:

```bash
cd /c/Projects/MockTrade_MCP
npm.cmd install
npm.cmd run build
npm.cmd test
```

For local development:

```bash
npm.cmd run dev
```

Run the built stdio server:

```bash
npm.cmd start
```

## MCP Client Config

An MCP client is the app that connects to this server. Codex, Claude Desktop, Cursor, and similar agent apps are MCP clients. MockTrade MCP is the MCP server.

Use the built package after `npm.cmd run build`.

Codex on Windows:

```toml
[mcp_servers.mocktrade]
command = 'C:\Program Files\nodejs\node.exe'
args = ['C:\Projects\MockTrade_MCP\dist\index.js']
startup_timeout_sec = 30
```

Generic JSON-style MCP client config:

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

During development, you can run through `tsx` if your client supports `npx`:

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

After changing MCP client config, restart the client app. For Codex Desktop, fully quit and reopen Codex, then start a new conversation.

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

## Smoke Tests

List registered MCP tools from Git Bash:

```bash
cd /c/Projects/MockTrade_MCP
npm.cmd run build

printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| node.exe dist/index.js
```

Call `list_symbols` directly:

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_symbols","arguments":{}}}' \
| node.exe dist/index.js
```

Expected symbols:

```text
AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, SPY
```

## How To Use

### Normal Sandbox

Use normal sandbox mode when you want an agent to trade against deterministic current mock prices.

Typical flow:

1. Call `create_evaluation`.
2. Inspect `list_symbols`, `get_price`, or `get_bars`.
3. Call `place_order`.
4. Inspect `get_positions`, `get_trade_history`, `get_evaluation_status`, and `get_violations`.
5. Call `get_pnl_report` for a compact account report.

The sandbox enforces no naked shorting, cash checks, max single-position notional, max drawdown, daily loss, leverage limit, profit target, and minimum trading days.

### Replay / Backtest Mode

Use replay mode when you want to test an agent without future price leakage.

`create_replay_evaluation` creates a deterministic market timeline with:

- visible historical bars, controlled by `lookbackBars`
- hidden future bars, controlled by `tradingSteps`
- a current replay timestamp
- strict market-data protection, controlled by `strictMarketData`

The agent can only inspect market data through `get_visible_bars`, which returns bars up to the current replay time. Future bars remain hidden until `advance_time` is called.

By default, `strictMarketData` is `true`. While a strict replay still has hidden future bars, normal market-data tools are blocked:

- `get_price`
- `get_bars`

This forces the agent to use `get_visible_bars` during replay. Set `strictMarketData: false` only when you intentionally want to allow normal market-data access during a replay experiment.

Typical one-week replay flow:

1. Call `create_replay_evaluation` with `interval: "1d"`, `lookbackBars: 5`, and `tradingSteps: 5`.
2. Inspect `get_visible_bars`.
3. Decide whether to call `place_order`.
4. Call `advance_time` with `steps: 1`.
5. Repeat until `get_replay_status.replay.finished` is `true`.
6. Call `get_pnl_report` to inspect final PnL, positions, trades, violations, and PASS/FAIL state.

Orders inside replay mode execute at the current replay bar close. Positions and equity are marked to market at the current replay bar close.

## Example Agent Prompts

### Basic Prompts

- "Create a MockTrade evaluation with the default rules, then list tradable symbols."
- "Get the latest AAPL price and buy 10 shares in my evaluation."
- "Show my positions, trade history, and rule violations."
- "Try to reach the profit target without exceeding max drawdown or single-position limits."
- "Reset the sandbox and start a fresh deterministic run."

### Rule-Compliance Prompts

- "Create a MockTrade evaluation with a max single-position notional of 1000, then try to buy 100 shares of AAPL and explain whether the order was accepted."
- "Create a MockTrade evaluation, then try to sell AAPL before owning it. Report the exact rule or guard that blocks the trade."
- "Create a MockTrade evaluation with default rules, buy 10 shares of AAPL, then show my equity, positions, trade history, and violations."

### Replay / Backtest Prompts

- "Use MockTrade replay mode to create a 5-day daily replay for AAPL and SPY with 5 visible lookback bars. At each step, inspect only visible bars, decide whether to trade, advance one day, and report final PnL."
- "Create a strict replay evaluation with symbols AAPL, TSLA, and NVDA. Do not use get_price or get_bars during the replay; only use get_visible_bars. Trade for five daily steps, then show the PnL report."
- "Run a one-week replay evaluation. Keep max single-position notional at 20000, avoid naked shorts, and stop trading if any violation appears. At the end, summarize total PnL, drawdown, trades, and violations."
- "Compare two simple replay strategies: buy-and-hold AAPL versus staying in cash. Run each as a separate replay evaluation and report which had better final equity."

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

The trade ledger is the source of truth. Positions are rebuilt from trades and marked to market using either the normal mock provider or the replay clock. Rule status is recalculated when orders are placed, when replay time advances, and when evaluation status is requested.
