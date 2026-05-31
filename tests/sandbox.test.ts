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
});
