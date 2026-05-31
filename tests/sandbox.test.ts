import { describe, expect, it } from 'vitest';
import { SandboxError } from '../src/shared/errors.js';
import { SandboxService } from '../src/sandbox/sandbox-service.js';

describe('SandboxService', () => {
  it('returns deterministic market data after reset', () => {
    const sandbox = new SandboxService();

    const firstPrice = sandbox.getPrice('AAPL').price;
    const firstBars = sandbox.getBars('AAPL', '1d', 3);
    sandbox.resetSandbox();

    expect(sandbox.getPrice('AAPL').price).toBe(firstPrice);
    expect(sandbox.getBars('AAPL', '1d', 3)).toEqual(firstBars);
  });

  it('executes buy and sell orders', () => {
    const sandbox = new SandboxService();
    const evaluation = sandbox.createEvaluation({
      rules: { maxSinglePositionNotional: 1_000_000 },
    });

    const buy = sandbox.placeOrder({
      evaluationId: evaluation.id,
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 10,
    });
    expect(buy.trade.side).toBe('BUY');
    expect(sandbox.getPositions(evaluation.id)).toHaveLength(1);

    const sell = sandbox.placeOrder({
      evaluationId: evaluation.id,
      symbol: 'AAPL',
      side: 'SELL',
      quantity: 5,
    });
    expect(sell.trade.side).toBe('SELL');
    expect(sandbox.getPositions(evaluation.id)[0]?.quantity).toBe(5);
  });

  it('rejects naked short sells', () => {
    const sandbox = new SandboxService();
    const evaluation = sandbox.createEvaluation();

    expect(() =>
      sandbox.placeOrder({
        evaluationId: evaluation.id,
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 1,
      }),
    ).toThrow(SandboxError);
  });

  it('rebuilds positions and realized PnL from the trade ledger', () => {
    const sandbox = new SandboxService();
    const evaluation = sandbox.createEvaluation({
      rules: { maxSinglePositionNotional: 1_000_000 },
    });

    sandbox.setTestPrice('AAPL', 100);
    sandbox.placeOrder({ evaluationId: evaluation.id, symbol: 'AAPL', side: 'BUY', quantity: 10 });
    sandbox.setTestPrice('AAPL', 110);
    sandbox.placeOrder({ evaluationId: evaluation.id, symbol: 'AAPL', side: 'SELL', quantity: 4 });

    const position = sandbox.getPositions(evaluation.id)[0];
    expect(position?.quantity).toBe(6);
    expect(position?.realizedPnl).toBeGreaterThan(30);
  });

  it('fails an evaluation when max drawdown is exceeded', () => {
    const sandbox = new SandboxService();
    const evaluation = sandbox.createEvaluation({
      rules: {
        maxDrawdown: 1_000,
        maxSinglePositionNotional: 1_000_000,
        minTradingDays: 0,
      },
    });

    sandbox.setTestPrice('AAPL', 100);
    sandbox.placeOrder({ evaluationId: evaluation.id, symbol: 'AAPL', side: 'BUY', quantity: 100 });
    sandbox.setTestPrice('AAPL', 1);

    const status = sandbox.getEvaluationStatus(evaluation.id);
    expect(status.evaluation.status).toBe('FAILED');
    expect(status.violations.some((violation) => violation.ruleType === 'MAX_DRAWDOWN')).toBe(true);
  });

  it('passes an evaluation when profit target and trading-day rules are met', () => {
    const sandbox = new SandboxService();
    const evaluation = sandbox.createEvaluation({
      rules: {
        profitTarget: 100,
        minTradingDays: 0,
        maxSinglePositionNotional: 1_000_000,
      },
    });

    sandbox.setTestPrice('AAPL', 100);
    sandbox.placeOrder({ evaluationId: evaluation.id, symbol: 'AAPL', side: 'BUY', quantity: 10 });
    sandbox.setTestPrice('AAPL', 120);

    const status = sandbox.getEvaluationStatus(evaluation.id);
    expect(status.evaluation.status).toBe('PASSED');
    expect(status.metrics.totalPnL).toBeGreaterThan(100);
  });

  it('supports a full MCP-like flow', () => {
    const sandbox = new SandboxService();
    const symbols = sandbox.listSymbols();
    const price = sandbox.getPrice(symbols[0]!);
    const bars = sandbox.getBars(symbols[0]!, '1m', 5);
    const evaluation = sandbox.createEvaluation();
    const order = sandbox.placeOrder({
      evaluationId: evaluation.id,
      symbol: symbols[0]!,
      side: 'BUY',
      quantity: 1,
      clientOrderId: 'agent-order-1',
    });
    const duplicate = sandbox.placeOrder({
      evaluationId: evaluation.id,
      symbol: symbols[0]!,
      side: 'BUY',
      quantity: 1,
      clientOrderId: 'agent-order-1',
    });

    expect(price.symbol).toBe(symbols[0]);
    expect(bars).toHaveLength(5);
    expect(order.trade.id).toBe(duplicate.trade.id);
    expect(duplicate.idempotent).toBe(true);
    expect(sandbox.getTradeHistory(evaluation.id)).toHaveLength(1);
    expect(sandbox.getViolations(evaluation.id)).toEqual([]);
  });

  it('hides future bars in replay evaluations until time advances', () => {
    const sandbox = new SandboxService();
    const replay = sandbox.createReplayEvaluation({
      symbols: ['AAPL'],
      lookbackBars: 3,
      tradingSteps: 5,
    });

    const initialBars = sandbox.getVisibleBars(replay.evaluation.id, 'AAPL');
    expect(initialBars.bars.AAPL).toHaveLength(3);
    expect(initialBars.hiddenFutureBars).toBe(5);

    sandbox.advanceTime({ evaluationId: replay.evaluation.id });
    const nextBars = sandbox.getVisibleBars(replay.evaluation.id, 'AAPL');

    expect(nextBars.bars.AAPL).toHaveLength(4);
    expect(nextBars.hiddenFutureBars).toBe(4);
    expect(nextBars.bars.AAPL?.at(-1)?.startTs).not.toBe(initialBars.bars.AAPL?.at(-1)?.startTs);
  });

  it('blocks normal market data tools during strict replay', () => {
    const sandbox = new SandboxService();
    const replay = sandbox.createReplayEvaluation({
      symbols: ['AAPL'],
      lookbackBars: 3,
      tradingSteps: 2,
    });

    expect(() => sandbox.getPrice('AAPL')).toThrow(SandboxError);
    expect(() => sandbox.getBars('AAPL', '1d', 3)).toThrow(SandboxError);
    expect(sandbox.getVisibleBars(replay.evaluation.id, 'AAPL').bars.AAPL).toHaveLength(3);

    sandbox.advanceTime({ evaluationId: replay.evaluation.id, steps: 2 });

    expect(sandbox.getReplayStatus(replay.evaluation.id).replay.finished).toBe(true);
    expect(sandbox.getPrice('AAPL').symbol).toBe('AAPL');
  });

  it('allows normal market data tools when replay strict mode is disabled', () => {
    const sandbox = new SandboxService();
    sandbox.createReplayEvaluation({
      symbols: ['AAPL'],
      lookbackBars: 3,
      tradingSteps: 2,
      strictMarketData: false,
    });

    expect(sandbox.getPrice('AAPL').symbol).toBe('AAPL');
    expect(sandbox.getBars('AAPL', '1d', 3)).toHaveLength(3);
  });

  it('runs a one-week replay and reports PnL', () => {
    const sandbox = new SandboxService();
    const replay = sandbox.createReplayEvaluation({
      symbols: ['AAPL'],
      lookbackBars: 5,
      tradingSteps: 5,
      rules: {
        maxSinglePositionNotional: 1_000_000,
        maxDrawdown: 1_000_000,
      },
    });

    sandbox.placeOrder({
      evaluationId: replay.evaluation.id,
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 10,
    });

    sandbox.advanceTime({ evaluationId: replay.evaluation.id, steps: 5 });
    const status = sandbox.getReplayStatus(replay.evaluation.id);
    const report = sandbox.getPnlReport(replay.evaluation.id);

    expect(status.replay.finished).toBe(true);
    expect(report.tradeCount).toBe(1);
    expect(report.replay?.totalSteps).toBe(5);
    expect(report.totalPnL).toBeCloseTo(report.equity - report.initialBalance, 6);
  });
});
