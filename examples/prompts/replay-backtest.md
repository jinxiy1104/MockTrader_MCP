# Strict Replay Backtest Prompt

```text
Use MockTrade to run a strict replay backtest.

Create a replay evaluation with:
- dataSource: mock
- symbols: AAPL and SPY
- interval: 1d
- lookbackBars: 5
- tradingSteps: 5
- strictMarketData: true
- rules:
  - maxSinglePositionNotional: 1000000
  - maxDrawdown: 1000000
  - minTradingDays: 0

Constraints:
- Only use get_visible_bars for market data during replay.
- Do not use get_price or get_bars until the replay is finished.
- At each step, inspect visible bars, decide whether to buy, sell, or hold, then advance time by 1d.
- Stop when get_replay_status says the replay is finished.
- At the end, call get_pnl_report.

Report:
- final equity
- total PnL
- realized and unrealized PnL
- final positions
- all trades
- rule violations
- whether the replay finished
```

For real historical data, use `dataSource: historical_csv` and provide `datasetDir`, `start`, and `end`.
