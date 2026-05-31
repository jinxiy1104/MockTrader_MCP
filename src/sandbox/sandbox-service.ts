import { randomUUID } from 'node:crypto';
import {
  Evaluation,
  EvaluationMetrics,
  MarketBar,
  MarketPrice,
  Position,
  RuleViolation,
  Ruleset,
  Trade,
  TradeSide,
  Violation,
  BarInterval,
} from '../domain/types.js';
import { MockMarketProvider } from '../market/mock-market-provider.js';
import { ruleValidatorRegistry } from '../rules/rule-validator-registry.js';
import { DEFAULT_INITIAL_BALANCE, DEFAULT_RULES, TRADING_LIMITS } from '../shared/constants.js';
import { conflict, evaluationClosed, insufficientFunds, invalidInput, notFound } from '../shared/errors.js';
import { RulesInput } from '../tools/schemas.js';
import { InMemoryStore } from './in-memory-store.js';
import { rebuildPositions, roundMoney } from './position-calculator.js';

interface CreateEvaluationInput {
  challengeName?: string;
  initialBalance?: number;
  rules?: RulesInput;
}

interface PlaceOrderInput {
  evaluationId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  clientOrderId?: string;
}

export class SandboxService {
  constructor(
    private readonly market = new MockMarketProvider(),
    private readonly store = new InMemoryStore(),
  ) {}

  listSymbols(): string[] {
    return this.market.listSymbols();
  }

  getPrice(symbol: string): MarketPrice {
    return this.market.getLastPrice(symbol);
  }

  getBars(symbol: string, interval: BarInterval, limit: number): MarketBar[] {
    return this.market.getBars(symbol, interval, limit);
  }

  createEvaluation(input: CreateEvaluationInput = {}): Evaluation {
    const initialBalance = input.initialBalance ?? DEFAULT_INITIAL_BALANCE;
    if (!Number.isFinite(initialBalance) || initialBalance <= 0) {
      throw invalidInput('Initial balance must be a positive number.');
    }

    const now = new Date().toISOString();
    const rules: Ruleset = {
      id: randomUUID(),
      ...DEFAULT_RULES,
      ...input.rules,
      name: input.rules?.name ?? input.challengeName ?? DEFAULT_RULES.name,
    };

    const evaluation: Evaluation = {
      id: randomUUID(),
      challengeName: input.challengeName ?? rules.name,
      status: 'ACTIVE',
      initialBalance,
      currentBalance: initialBalance,
      equity: initialBalance,
      peakEquity: initialBalance,
      rules,
      createdAt: now,
      updatedAt: now,
    };

    this.store.evaluations.set(evaluation.id, evaluation);
    this.store.setTrades(evaluation.id, []);

    return evaluation;
  }

  placeOrder(input: PlaceOrderInput) {
    const evaluation = this.getEvaluationOrThrow(input.evaluationId);
    if (evaluation.status !== 'ACTIVE') {
      throw evaluationClosed(`Cannot trade on ${evaluation.status} evaluation.`);
    }

    this.validateQuantity(input.quantity);
    const symbol = this.market.normalizeSymbol(input.symbol);
    const side = input.side;

    if (input.clientOrderId) {
      const clientOrderKey = this.clientOrderKey(evaluation.id, input.clientOrderId);
      const existing = this.store.clientOrderIds.get(clientOrderKey);
      if (existing) {
        return {
          trade: existing,
          evaluation: this.getEvaluationStatus(evaluation.id).evaluation,
          idempotent: true,
        };
      }
    }

    const positionsBefore = this.getPositions(evaluation.id);
    const existingPosition = positionsBefore.find((position) => position.symbol === symbol);

    if (side === 'SELL' && input.quantity > (existingPosition?.quantity ?? 0)) {
      throw conflict(
        `Cannot sell ${input.quantity}. Available quantity: ${existingPosition?.quantity ?? 0}. Shorting is not allowed.`,
      );
    }

    const marketPrice = this.market.getLastPrice(symbol).price;
    if (side === 'BUY') {
      this.assertBuyWithinSinglePositionLimit(evaluation, symbol, input.quantity, marketPrice, existingPosition);
    }

    const { executedPrice, fee } = this.calculateExecution(marketPrice, input.quantity, side);
    const orderValue = input.quantity * executedPrice;
    const cashDelta = side === 'BUY' ? -(orderValue + fee) : orderValue - fee;
    const newBalance = roundMoney(evaluation.currentBalance + cashDelta);

    if (newBalance < 0) {
      throw insufficientFunds(
        `Insufficient funds: order requires $${roundMoney(orderValue + fee)}, available: $${evaluation.currentBalance}.`,
      );
    }

    const trade: Trade = {
      id: randomUUID(),
      evaluationId: evaluation.id,
      symbol,
      side,
      quantity: input.quantity,
      price: executedPrice,
      fee,
      clientOrderId: input.clientOrderId,
      executedAt: new Date().toISOString(),
    };

    const trades = [...this.store.getTrades(evaluation.id), trade];
    this.store.setTrades(evaluation.id, trades);
    if (input.clientOrderId) {
      this.store.clientOrderIds.set(this.clientOrderKey(evaluation.id, input.clientOrderId), trade);
    }

    this.refreshEvaluationAccount(evaluation.id, newBalance);
    const ruleResult = this.evaluateAccount(evaluation.id);

    return {
      trade,
      evaluation: this.getEvaluationOrThrow(evaluation.id),
      ruleResult,
      idempotent: false,
    };
  }

  getEvaluationStatus(evaluationId: string) {
    this.refreshEvaluationAccount(evaluationId);
    const current = this.getEvaluationOrThrow(evaluationId);
    if (current.status === 'ACTIVE') {
      this.evaluateAccount(evaluationId);
    }
    const evaluation = this.getEvaluationOrThrow(evaluationId);
    const metrics = this.calculateMetrics(evaluationId);
    const violations = this.getViolations(evaluationId);
    const passConditionsMet = ruleValidatorRegistry.checkPassConditions(metrics, evaluation.rules);

    return {
      evaluation,
      metrics,
      rules: evaluation.rules,
      positions: this.getPositions(evaluationId),
      violations,
      passConditionsMet,
    };
  }

  getPositions(evaluationId: string): Position[] {
    this.getEvaluationOrThrow(evaluationId);
    return rebuildPositions({
      evaluationId,
      trades: this.store.getTrades(evaluationId),
      market: this.market,
    });
  }

  getTradeHistory(evaluationId: string, limit = 100): Trade[] {
    this.getEvaluationOrThrow(evaluationId);
    return [...this.store.getTrades(evaluationId)]
      .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
      .slice(0, limit);
  }

  getViolations(evaluationId: string): Violation[] {
    this.getEvaluationOrThrow(evaluationId);
    return this.store.violations.get(evaluationId) ?? [];
  }

  resetSandbox() {
    this.store.reset();
    this.market.reset();
    return {
      ok: true,
      message: 'Sandbox reset.',
    };
  }

  setTestPrice(symbol: string, price: number): void {
    this.market.setTestPrice(symbol, price);
  }

  private evaluateAccount(evaluationId: string) {
    const evaluation = this.getEvaluationOrThrow(evaluationId);
    const metrics = this.calculateMetrics(evaluationId);
    const ruleViolations = ruleValidatorRegistry.validateAll(metrics, evaluation.rules);

    if (ruleViolations.length > 0) {
      for (const ruleViolation of ruleViolations) {
        this.recordViolation(evaluationId, ruleViolation);
      }
      this.updateEvaluation(evaluationId, {
        status: 'FAILED',
        statusReason: 'RULE_FAIL',
      });
      return {
        passed: false,
        violations: ruleViolations,
        newStatus: 'FAILED' as const,
      };
    }

    if (ruleValidatorRegistry.checkPassConditions(metrics, evaluation.rules)) {
      this.updateEvaluation(evaluationId, {
        status: 'PASSED',
        statusReason: 'PROFIT_TARGET',
      });
      return {
        passed: true,
        violations: [],
        newStatus: 'PASSED' as const,
      };
    }

    return {
      passed: true,
      violations: [],
      newStatus: evaluation.status,
    };
  }

  private calculateMetrics(evaluationId: string): EvaluationMetrics {
    const evaluation = this.getEvaluationOrThrow(evaluationId);
    const positions = this.getPositions(evaluationId);
    const openPositionsValue = roundMoney(
      positions.reduce((sum, position) => sum + Math.abs(position.marketValue), 0),
    );
    const currentDrawdown = roundMoney(Math.max(0, evaluation.peakEquity - evaluation.equity));
    const totalPnL = roundMoney(evaluation.equity - evaluation.initialBalance);
    const leverage = evaluation.equity > 0 ? roundMoney(openPositionsValue / evaluation.equity) : 0;

    return {
      currentEquity: evaluation.equity,
      peakEquity: evaluation.peakEquity,
      currentDrawdown,
      dailyPnL: this.calculateDailyPnL(evaluationId),
      totalPnL,
      openPositionsValue,
      leverage,
      tradingDays: this.countTradingDays(evaluationId),
    };
  }

  private calculateDailyPnL(evaluationId: string): number {
    const today = new Date().toISOString().slice(0, 10);
    const trades = this.store.getTrades(evaluationId).filter((trade) => trade.executedAt.slice(0, 10) === today);

    const dailyPnL = trades.reduce((sum, trade) => {
      const currentPrice = this.market.peekLastPrice(trade.symbol);
      if (trade.side === 'BUY') {
        return sum + trade.quantity * (currentPrice - trade.price) - trade.fee;
      }
      return sum + trade.quantity * (trade.price - currentPrice) - trade.fee;
    }, 0);

    return roundMoney(dailyPnL);
  }

  private refreshEvaluationAccount(evaluationId: string, nextBalance?: number): Evaluation {
    const evaluation = this.getEvaluationOrThrow(evaluationId);
    const currentBalance = nextBalance ?? evaluation.currentBalance;
    const positions = rebuildPositions({
      evaluationId,
      trades: this.store.getTrades(evaluationId),
      market: this.market,
    });
    const openMarketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const equity = roundMoney(currentBalance + openMarketValue);
    const peakEquity = roundMoney(Math.max(evaluation.peakEquity, equity));

    return this.updateEvaluation(evaluationId, {
      currentBalance,
      equity,
      peakEquity,
    });
  }

  private updateEvaluation(evaluationId: string, patch: Partial<Evaluation>): Evaluation {
    const evaluation = this.getEvaluationOrThrow(evaluationId);
    const updated = {
      ...evaluation,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.store.evaluations.set(evaluationId, updated);
    return updated;
  }

  private recordViolation(evaluationId: string, ruleViolation: RuleViolation): void {
    this.store.addViolation({
      id: randomUUID(),
      evaluationId,
      ruleType: ruleViolation.ruleType,
      value: roundMoney(ruleViolation.value),
      threshold: roundMoney(ruleViolation.threshold),
      message: ruleViolation.message,
      createdAt: new Date().toISOString(),
    });
  }

  private assertBuyWithinSinglePositionLimit(
    evaluation: Evaluation,
    symbol: string,
    requestedQuantity: number,
    currentPrice: number,
    existingPosition?: Position,
  ): void {
    const limit = evaluation.rules.maxSinglePositionNotional;
    if (limit === undefined) {
      return;
    }

    const existingQuantity = existingPosition?.quantity ?? 0;
    const resultingNotional = (existingQuantity + requestedQuantity) * currentPrice;
    if (resultingNotional > limit) {
      throw invalidInput(`Cannot trade above max single-position notional (${limit.toFixed(2)}).`);
    }
  }

  private calculateExecution(marketPrice: number, quantity: number, side: TradeSide) {
    const slippageAmount = marketPrice * TRADING_LIMITS.simulatedSlippage;
    const executedPrice = roundMoney(side === 'BUY' ? marketPrice + slippageAmount : marketPrice - slippageAmount);
    const fee = roundMoney(quantity * executedPrice * TRADING_LIMITS.simulatedFeeRate);
    return { executedPrice, fee };
  }

  private validateQuantity(quantity: number): void {
    if (!Number.isFinite(quantity)) {
      throw invalidInput('Quantity must be a finite number.');
    }
    if (quantity < TRADING_LIMITS.minOrderQuantity) {
      throw invalidInput(`Quantity too small: minimum is ${TRADING_LIMITS.minOrderQuantity}.`);
    }
    if (quantity > TRADING_LIMITS.maxOrderQuantity) {
      throw invalidInput(`Quantity too large: maximum is ${TRADING_LIMITS.maxOrderQuantity}.`);
    }
  }

  private countTradingDays(evaluationId: string): number {
    return new Set(this.store.getTrades(evaluationId).map((trade) => trade.executedAt.slice(0, 10))).size;
  }

  private getEvaluationOrThrow(evaluationId: string): Evaluation {
    const evaluation = this.store.evaluations.get(evaluationId);
    if (!evaluation) {
      throw notFound(`Evaluation not found: ${evaluationId}`);
    }
    return evaluation;
  }

  private clientOrderKey(evaluationId: string, clientOrderId: string): string {
    return `${evaluationId}:${clientOrderId}`;
  }
}
