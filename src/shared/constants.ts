export const DEFAULT_INITIAL_BALANCE = 100_000;

export const SYMBOL_CONFIG = {
  AAPL: { base: 180, volatility: 0.02 },
  TSLA: { base: 250, volatility: 0.03 },
  NVDA: { base: 500, volatility: 0.025 },
  MSFT: { base: 370, volatility: 0.015 },
  GOOGL: { base: 140, volatility: 0.02 },
  AMZN: { base: 150, volatility: 0.02 },
  SPY: { base: 450, volatility: 0.01 },
} as const;

export const SYMBOLS = Object.keys(SYMBOL_CONFIG);

export const DEFAULT_RULES = {
  name: 'MockTrade Default Challenge',
  maxDrawdown: 10_000,
  dailyLossLimit: 5_000,
  profitTarget: 10_000,
  maxSinglePositionNotional: 20_000,
  leverageLimit: 2,
  minTradingDays: 5,
} as const;

export const TRADING_LIMITS = {
  minOrderQuantity: 0.001,
  maxOrderQuantity: 10_000,
  simulatedSlippage: 0.0001,
  simulatedFeeRate: 0.001,
} as const;

export const SUPPORTED_INTERVALS = ['1m', '1d'] as const;
