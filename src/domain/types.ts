import { SUPPORTED_INTERVALS } from '../shared/constants.js';

export type EvaluationStatus = 'ACTIVE' | 'FAILED' | 'PASSED' | 'FROZEN';
export type TradeSide = 'BUY' | 'SELL';
export type BarInterval = (typeof SUPPORTED_INTERVALS)[number];

export interface Ruleset {
  id: string;
  name: string;
  maxDrawdown?: number;
  dailyLossLimit?: number;
  profitTarget?: number;
  maxSinglePositionNotional?: number;
  leverageLimit?: number;
  minTradingDays?: number;
}

export interface Evaluation {
  id: string;
  challengeName: string;
  status: EvaluationStatus;
  initialBalance: number;
  currentBalance: number;
  equity: number;
  peakEquity: number;
  rules: Ruleset;
  createdAt: string;
  updatedAt: string;
  statusReason?: string;
}

export interface Trade {
  id: string;
  evaluationId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  clientOrderId?: string;
  executedAt: string;
}

export interface Position {
  evaluationId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  currentPrice: number;
  marketValue: number;
}

export interface Violation {
  id: string;
  evaluationId: string;
  ruleType: RuleType;
  value: number;
  threshold: number;
  message: string;
  createdAt: string;
}

export type MarketDataSource = 'MOCK' | 'HISTORICAL_CSV' | 'ALPACA' | 'POLYGON';

export interface MarketPrice {
  symbol: string;
  price: number;
  ts: string;
  source: MarketDataSource;
}

export interface MarketBar {
  symbol: string;
  startTs: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ReplaySession {
  evaluationId: string;
  symbols: string[];
  interval: BarInterval;
  lookbackBars: number;
  tradingSteps: number;
  strictMarketData: boolean;
  dataSource: MarketDataSource;
  start?: string;
  end?: string;
  currentIndex: number;
  startedAtIndex: number;
  barsBySymbol: Record<string, MarketBar[]>;
  createdAt: string;
}

export interface EvaluationMetrics {
  currentEquity: number;
  peakEquity: number;
  currentDrawdown: number;
  dailyPnL: number;
  totalPnL: number;
  openPositionsValue: number;
  leverage: number;
  tradingDays: number;
}

export enum RuleType {
  MAX_DRAWDOWN = 'MAX_DRAWDOWN',
  DAILY_LOSS_LIMIT = 'DAILY_LOSS_LIMIT',
  LEVERAGE_LIMIT = 'LEVERAGE_LIMIT',
}

export interface RuleViolation {
  ruleType: RuleType;
  value: number;
  threshold: number;
  message: string;
}
