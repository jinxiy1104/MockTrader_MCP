import { randomUUID } from 'node:crypto';
import {
  Evaluation,
  EvaluationMetrics,
  MarketBar,
  MarketPrice,
  Position,
  ReplaySession,
  RuleViolation,
  Ruleset,
  Trade,
  TradeSide,
  Violation,
  BarInterval,
  MarketDataSource,
} from '../domain/types.js';
import { AlpacaMarketDataProvider, PolygonMarketDataProvider } from '../market/external-market-provider.js';
import { HistoricalCsvProvider } from '../market/historical-csv-provider.js';
import { MockMarketProvider } from '../market/mock-market-provider.js';
import { ReplayDataProvider } from '../market/replay-data-provider.js';
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

interface CreateReplayEvaluationInput extends CreateEvaluationInput {
  symbols?: string[];
  interval?: BarInterval;
  lookbackBars?: number;
  tradingSteps?: number;
  strictMarketData?: boolean;
  dataSource?: ReplayInputDataSource;
  datasetDir?: string;
  start?: string;
  end?: string;
  alpacaApiKeyId?: string;
  alpacaSecretKey?: string;
  polygonApiKey?: string;
}

interface PlaceOrderInput {
  evaluationId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  clientOrderId?: string;
}

interface AdvanceTimeInput {
  evaluationId: string;
  steps?: number;
  duration?: string;
}

type ReplayInputDataSource = 'mock' | 'historical_csv' | 'alpaca' | 'polygon';

export class SandboxService {
  constructor(
    private readonly market = new MockMarketProvider(),
    private readonly store = new InMemoryStore(),
  ) {}

  listSymbols(): string[] {
    return this.market.listSymbols();
  }

  listHistoricalDatasets(datasetDir?: string) {
    return new HistoricalCsvProvider().listDatasets(datasetDir);
  }

  getPrice(symbol: string): MarketPrice {
    this.assertNoStrictReplayMarketData('get_price');
    return this.market.getLastPrice(symbol);
  }

  getBars(symbol: string, interval: BarInterval, limit: number): MarketBar[] {
    this.assertNoStrictReplayMarketData('get_bars');
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

  async createReplayEvaluation(input: CreateReplayEvaluationInput = {}) {
    const symbols = this.normalizeReplaySymbols(input.symbols);
    const interval = input.interval ?? '1d';
    const lookbackBars = input.lookbackBars ?? 5;
    const tradingSteps = input.tradingSteps ?? 5;
    const strictMarketData = input.strictMarketData ?? true;
    const dataSource = input.dataSource ?? 'mock';

    if (!Number.isInteger(lookbackBars) || lookbackBars < 1) {
      throw invalidInput('lookbackBars must be a positive integer.');
    }
    if (!Number.isInteger(tradingSteps) || tradingSteps < 1) {
      throw invalidInput('tradingSteps must be a positive integer.');
    }

    const totalBars = lookbackBars + tradingSteps;
    const evaluation = this.createEvaluation({
      challengeName: input.challengeName ?? 'MockTrade Replay Evaluation',
      initialBalance: input.initialBalance,
      rules: input.rules,
    });

    const replayBars = await this.loadReplayBars({
      dataSource,
      symbols,
      interval,
      totalBars,
      datasetDir: input.datasetDir,
      start: input.start,
      end: input.end,
      alpacaApiKeyId: input.alpacaApiKeyId,
      alpacaSecretKey: input.alpacaSecretKey,
      polygonApiKey: input.polygonApiKey,
    });

    const replay: ReplaySession = {
      evaluationId: evaluation.id,
      symbols,
      interval,
      lookbackBars,
      tradingSteps,
      strictMarketData,
      dataSource: replayBars.source,
      start: input.start,
      end: input.end,
      currentIndex: lookbackBars - 1,
      startedAtIndex: lookbackBars - 1,
      barsBySymbol: replayBars.barsBySymbol,
      createdAt: new Date().toISOString(),
    };

    this.store.replaySessions.set(evaluation.id, replay);
    this.refreshEvaluationAccount(evaluation.id);

    return {
      evaluation: this.getEvaluationOrThrow(evaluation.id),
      replay: this.getReplayStatus(evaluation.id).replay,
      visibleBars: this.getVisibleBars(evaluation.id),
    };
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

    const marketPrice = this.getExecutionPrice(evaluation.id, symbol);
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
      executedAt: this.getExecutionTimestamp(evaluation.id),
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
      getCurrentPrice: (symbol) => this.getCurrentPriceForEvaluation(evaluationId, symbol),
    });
  }

  getVisibleBars(evaluationId: string, symbol?: string, limit?: number) {
    const replay = this.getReplayOrThrow(evaluationId);
    const symbols = symbol ? [this.normalizeReplaySymbolForSession(replay, symbol)] : replay.symbols;
    const boundedLimit = limit === undefined ? undefined : Math.max(1, Math.min(limit, 1000));
    const bars = Object.fromEntries(
      symbols.map((entry) => {
        const visible = replay.barsBySymbol[entry]!.slice(0, replay.currentIndex + 1);
        return [entry, boundedLimit === undefined ? visible : visible.slice(-boundedLimit)];
      }),
    );

    return {
      evaluationId,
      currentTime: this.getReplayCurrentBar(replay, replay.symbols[0]!).startTs,
      visibleThroughIndex: replay.currentIndex,
      visibleThrough: this.getReplayCurrentBar(replay, replay.symbols[0]!).startTs,
      hiddenFutureBars: this.getHiddenBarsRemaining(replay),
      bars,
    };
  }

  advanceTime(input: AdvanceTimeInput) {
    const replay = this.getReplayOrThrow(input.evaluationId);
    const requestedSteps = this.resolveAdvanceSteps(replay, input);
    if (!Number.isInteger(requestedSteps) || requestedSteps < 1) {
      throw invalidInput('steps must be a positive integer.');
    }

    const maxIndex = this.getReplayMaxIndex(replay);
    const nextIndex = Math.min(maxIndex, replay.currentIndex + requestedSteps);
    replay.currentIndex = nextIndex;
    this.store.replaySessions.set(replay.evaluationId, replay);

    this.refreshEvaluationAccount(replay.evaluationId);
    const current = this.getEvaluationOrThrow(replay.evaluationId);
    if (current.status === 'ACTIVE') {
      this.evaluateAccount(replay.evaluationId);
    }

    return this.getReplayStatus(replay.evaluationId);
  }

  getReplayStatus(evaluationId: string) {
    const replay = this.getReplayOrThrow(evaluationId);
    const maxIndex = this.getReplayMaxIndex(replay);
    const elapsedSteps = replay.currentIndex - replay.startedAtIndex;
    const currentBar = this.getReplayCurrentBar(replay, replay.symbols[0]!);

    return {
      evaluation: this.getEvaluationStatus(evaluationId).evaluation,
      replay: {
        evaluationId,
        symbols: replay.symbols,
        interval: replay.interval,
        strictMarketData: replay.strictMarketData,
        dataSource: replay.dataSource,
        start: replay.start,
        end: replay.end,
        currentTime: currentBar.startTs,
        currentIndex: replay.currentIndex,
        currentStep: elapsedSteps,
        totalSteps: replay.tradingSteps,
        finished: replay.currentIndex >= maxIndex,
        visibleThrough: currentBar.startTs,
        hiddenFutureBars: this.getHiddenBarsRemaining(replay),
      },
    };
  }

  getPnlReport(evaluationId: string) {
    const status = this.getEvaluationStatus(evaluationId);
    const positions = status.positions;
    const trades = this.getTradeHistory(evaluationId, 1000);
    const unrealizedPnl = roundMoney(positions.reduce((sum, position) => sum + position.unrealizedPnl, 0));
    const realizedPnl = roundMoney(status.metrics.totalPnL - unrealizedPnl);
    const replay = this.store.replaySessions.has(evaluationId) ? this.getReplayStatus(evaluationId).replay : undefined;

    return {
      evaluationId,
      status: status.evaluation.status,
      statusReason: status.evaluation.statusReason,
      initialBalance: status.evaluation.initialBalance,
      cashBalance: status.evaluation.currentBalance,
      equity: status.evaluation.equity,
      totalPnL: status.metrics.totalPnL,
      realizedPnl,
      unrealizedPnl,
      returnPct: roundMoney((status.metrics.totalPnL / status.evaluation.initialBalance) * 100),
      metrics: status.metrics,
      positions,
      tradeCount: trades.length,
      trades,
      violations: status.violations,
      replay,
    };
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
      const currentPrice = this.getCurrentPriceForEvaluation(evaluationId, trade.symbol);
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
      getCurrentPrice: (symbol) => this.getCurrentPriceForEvaluation(evaluationId, symbol),
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

  private async loadReplayBars(input: {
    dataSource: ReplayInputDataSource;
    symbols: string[];
    interval: BarInterval;
    totalBars: number;
    datasetDir?: string;
    start?: string;
    end?: string;
    alpacaApiKeyId?: string;
    alpacaSecretKey?: string;
    polygonApiKey?: string;
  }) {
    if (input.dataSource === 'mock') {
      return {
        source: 'MOCK' as MarketDataSource,
        barsBySymbol: Object.fromEntries(
          input.symbols.map((symbol) => [symbol, this.market.getBars(symbol, input.interval, input.totalBars)]),
        ),
      };
    }

    const provider = this.getReplayDataProvider(input.dataSource);
    return provider.loadBars(input);
  }

  private getReplayDataProvider(dataSource: Exclude<ReplayInputDataSource, 'mock'>): ReplayDataProvider {
    switch (dataSource) {
      case 'historical_csv':
        return new HistoricalCsvProvider();
      case 'alpaca':
        return new AlpacaMarketDataProvider();
      case 'polygon':
        return new PolygonMarketDataProvider();
    }
  }

  private resolveAdvanceSteps(replay: ReplaySession, input: AdvanceTimeInput): number {
    if (input.steps !== undefined && input.duration !== undefined) {
      throw invalidInput('Use either steps or duration, not both.');
    }

    if (input.duration === undefined) {
      const requestedSteps = input.steps ?? 1;
      if (!Number.isInteger(requestedSteps) || requestedSteps < 1) {
        throw invalidInput('steps must be a positive integer.');
      }
      return requestedSteps;
    }

    return this.durationToSteps(replay.interval, input.duration);
  }

  private durationToSteps(interval: BarInterval, duration: string): number {
    const match = /^(\d+)(m|h|d)$/i.exec(duration.trim());
    if (!match) {
      throw invalidInput('duration must use a format like 5m, 1h, or 1d.');
    }

    const amount = Number(match[1]);
    const unit = match[2]!.toLowerCase();
    const minutes = unit === 'm' ? amount : unit === 'h' ? amount * 60 : amount * 390;
    const intervalMinutes = interval === '1m' ? 1 : 390;
    const steps = Math.ceil(minutes / intervalMinutes);

    if (steps < 1) {
      throw invalidInput('duration must advance at least one replay step.');
    }
    return steps;
  }

  private getExecutionPrice(evaluationId: string, symbol: string): number {
    const replay = this.store.replaySessions.get(evaluationId);
    if (!replay) {
      return this.market.getLastPrice(symbol).price;
    }
    return this.getReplayCurrentBar(replay, symbol).close;
  }

  private assertNoStrictReplayMarketData(toolName: string): void {
    const strictReplay = [...this.store.replaySessions.values()].find(
      (replay) => replay.strictMarketData && replay.currentIndex < this.getReplayMaxIndex(replay),
    );

    if (!strictReplay) {
      return;
    }

    throw conflict(
      `${toolName} is blocked while strict replay evaluation ${strictReplay.evaluationId} has hidden future bars. Use get_visible_bars for replay market data, then advance_time when ready.`,
    );
  }

  private getExecutionTimestamp(evaluationId: string): string {
    const replay = this.store.replaySessions.get(evaluationId);
    if (!replay) {
      return new Date().toISOString();
    }
    return this.getReplayCurrentBar(replay, replay.symbols[0]!).startTs;
  }

  private getCurrentPriceForEvaluation(evaluationId: string, symbol: string): number {
    const replay = this.store.replaySessions.get(evaluationId);
    if (!replay) {
      return this.market.peekLastPrice(symbol);
    }
    return this.getReplayCurrentBar(replay, symbol).close;
  }

  private normalizeReplaySymbols(symbols?: string[]): string[] {
    const normalized = (symbols && symbols.length > 0 ? symbols : this.market.listSymbols()).map((symbol) =>
      this.market.normalizeSymbol(symbol),
    );
    return [...new Set(normalized)];
  }

  private normalizeReplaySymbolForSession(replay: ReplaySession, symbol: string): string {
    const normalized = this.market.normalizeSymbol(symbol);
    if (!replay.symbols.includes(normalized)) {
      throw invalidInput(`Symbol ${normalized} is not part of replay evaluation ${replay.evaluationId}.`);
    }
    return normalized;
  }

  private getReplayOrThrow(evaluationId: string): ReplaySession {
    this.getEvaluationOrThrow(evaluationId);
    const replay = this.store.replaySessions.get(evaluationId);
    if (!replay) {
      throw notFound(`Replay session not found for evaluation: ${evaluationId}`);
    }
    return replay;
  }

  private getReplayCurrentBar(replay: ReplaySession, symbol: string): MarketBar {
    const normalized = this.normalizeReplaySymbolForSession(replay, symbol);
    const bar = replay.barsBySymbol[normalized]?.[replay.currentIndex];
    if (!bar) {
      throw notFound(`Replay bar not found for ${normalized} at index ${replay.currentIndex}.`);
    }
    return bar;
  }

  private getReplayMaxIndex(replay: ReplaySession): number {
    return Math.min(...replay.symbols.map((symbol) => replay.barsBySymbol[symbol]!.length - 1));
  }

  private getHiddenBarsRemaining(replay: ReplaySession): number {
    return Math.max(0, this.getReplayMaxIndex(replay) - replay.currentIndex);
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
