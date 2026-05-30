/**
 * Rule Types and Interfaces
 * Defines the contracts for evaluation rules
 */

export interface RuleSet {
  id: string;
  name: string;
  maxDrawdown?: number;
  dailyLossLimit?: number;
  profitTarget?: number;
  maxSinglePositionNotional?: number;
  leverageLimit?: number;
  minTradingDays?: number;
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

export interface RuleCheckResult {
  passed: boolean;
  violations: RuleViolation[];
  newStatus?: 'ACTIVE' | 'FAILED' | 'PASSED' | 'FROZEN';
}

export interface RuleViolation {
  ruleType: string;
  value: number;
  threshold: number;
  message: string;
}

/**
 * Rule types enumeration
 */
export enum RuleType {
  MAX_DRAWDOWN = 'MAX_DRAWDOWN',
  DAILY_LOSS_LIMIT = 'DAILY_LOSS_LIMIT',
  PROFIT_TARGET = 'PROFIT_TARGET',
  MAX_POSITION_SIZE = 'MAX_POSITION_SIZE',
  LEVERAGE_LIMIT = 'LEVERAGE_LIMIT',
  MIN_TRADING_DAYS = 'MIN_TRADING_DAYS',
}

/**
 * Interface for rule validators
 */
export interface RuleValidator {
  validate(metrics: EvaluationMetrics, rules: RuleSet): RuleViolation | null;
}
