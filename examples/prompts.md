# Example Prompts

## Basic Sandbox

```text
Use MockTrade to create an evaluation with default rules, list available symbols, buy 10 shares of AAPL, then show positions, trade history, evaluation status, and violations.
```

## Rule Compliance

```text
Use MockTrade to create an evaluation with maxSinglePositionNotional 1000, then try to buy 100 shares of AAPL. Explain whether the order was accepted and which rule or guard applied.
```

## Strict Historical CSV Replay

```text
Use MockTrade to list local historical datasets from tests/fixtures/historical.

Then create a strict historical_csv replay evaluation with:
- dataSource: historical_csv
- datasetDir: tests/fixtures/historical
- symbols: AAPL
- interval: 1d
- start: 2024-01-02T21:00:00.000Z
- lookbackBars: 3
- tradingSteps: 2
- rules:
  - maxSinglePositionNotional: 1000000
  - maxDrawdown: 1000000
  - minTradingDays: 0

Only use get_visible_bars for market data. Buy 10 shares of AAPL at the first replay step, advance time by 2d, then call get_pnl_report. Report final equity, total PnL, positions, trades, violations, and whether the replay finished.
```

## Alpaca Replay

```text
Use MockTrade to create an Alpaca replay evaluation with:
- dataSource: alpaca
- symbols: AAPL and SPY
- interval: 1d
- start: 2024-01-02T14:30:00.000Z
- end: 2024-01-31T21:00:00.000Z
- lookbackBars: 5
- tradingSteps: 5
- rules:
  - maxSinglePositionNotional: 1000000
  - maxDrawdown: 1000000
  - minTradingDays: 0

Only use get_visible_bars during replay. Trade conservatively, advance time by 1d each step, then call get_pnl_report.
```
