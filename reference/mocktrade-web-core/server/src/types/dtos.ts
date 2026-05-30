/**
 * Data Transfer Objects for API requests and responses
 */

// ==================== Auth DTOs ====================
export interface RegisterDTO {
  email: string;
  password: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponseDTO {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

// ==================== Trading DTOs ====================
export interface PlaceOrderDTO {
  evaluationId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  clientOrderId?: string;
}

export interface OrderResultDTO {
  orderId: string;
  evaluationId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  executedPrice: number;
  fee: number;
  executedAt: Date;
  newBalance: number;
  newEquity: number;
}

export interface PositionDTO {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface TradeHistoryDTO {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fee: number;
  source: 'USER' | 'SYSTEM' | 'CORRECTION';
  clientOrderId?: string;
  executedAt: Date;
}

// ==================== Evaluation DTOs ====================
export interface CreateEvaluationDTO {
  userId: string;
  challengeName: string;
  rulesetId: string;
  initialBalance?: number;
  endAt?: Date;
}

export interface EvaluationStatusDTO {
  id: string;
  userId: string;
  challengeName: string;
  status: 'ACTIVE' | 'FAILED' | 'PASSED' | 'FROZEN';
  currentBalance: number;
  equity: number;
  initialBalance: number;
  totalPnL: number;
  totalPnLPercentage: number;
  startedAt: Date;
  endedAt?: Date;
  settledAt?: Date;
  settlementReason?: 'RULE_FAIL' | 'EXPIRED_PASS' | 'EXPIRED_FAIL' | 'MANUAL';
  rules: RulesetDTO;
  violations: ViolationDTO[];
}

export interface ViolationDTO {
  id: string;
  ruleType: string;
  value?: number;
  threshold?: number;
  occurredAt: Date;
}

// ==================== Ruleset DTOs ====================
export interface CreateRulesetDTO {
  name: string;
  maxDrawdown?: number;
  dailyLossLimit?: number;
  profitTarget?: number;
  maxSinglePositionNotional?: number;
  leverageLimit?: number;
  minTradingDays?: number;
}

export interface RulesetDTO {
  id: string;
  name: string;
  maxDrawdown?: number;
  dailyLossLimit?: number;
  profitTarget?: number;
  maxSinglePositionNotional?: number;
  leverageLimit?: number;
  minTradingDays?: number;
  isActive: boolean;
  createdAt: Date;
}

// ==================== Market Data DTOs ====================
export interface MarketPriceDTO {
  symbol: string;
  price: number;
  timestamp: Date;
  source: 'MOCK' | 'ALPACA' | 'POLYGON' | 'BINANCE' | 'ALPHA_VANTAGE';
}

export interface MarketBarDTO {
  symbol: string;
  startTs: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ==================== Dashboard DTOs ====================
export interface DashboardSummaryDTO {
  totalEvaluations: number;
  activeEvaluations: number;
  passedEvaluations: number;
  failedEvaluations: number;
  totalUsers: number;
}
