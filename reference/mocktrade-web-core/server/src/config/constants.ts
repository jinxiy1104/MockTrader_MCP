/**
 * Application-wide constants
 */

export const APP_CONSTANTS = {
  // Default evaluation account settings
  DEFAULT_INITIAL_BALANCE: 100000, // $100,000

  // Tradable symbols (mock data)
  SYMBOLS: {
    STOCKS: ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'SPY'],
  },

  // Mock price ranges (for realistic simulation)
  MOCK_PRICES: {
    AAPL: { base: 180, volatility: 0.02 },
    TSLA: { base: 250, volatility: 0.03 },
    NVDA: { base: 500, volatility: 0.025 },
    MSFT: { base: 370, volatility: 0.015 },
    GOOGL: { base: 140, volatility: 0.02 },
    AMZN: { base: 150, volatility: 0.02 },
    SPY: { base: 450, volatility: 0.01 },
  },

  // Trading settings
  TRADING: {
    MIN_ORDER_QUANTITY: 0.001,
    MAX_ORDER_QUANTITY: 10000,
    SIMULATED_SLIPPAGE: 0.0001, // 0.01% slippage
    SIMULATED_FEE_RATE: 0.001, // 0.1% fee
  },

  // Evaluation rules - default values
  DEFAULT_RULES: {
    MAX_DRAWDOWN: 10000, // $10,000 (10% of $100k)
    DAILY_LOSS_LIMIT: 5000, // $5,000 (5% of $100k)
    PROFIT_TARGET: 10000, // $10,000 (10% profit)
    MAX_POSITION_SIZE: 20000, // $20,000 (20% of account)
    LEVERAGE_LIMIT: 2, // 2x leverage
    MIN_TRADING_DAYS: 5,
  },
} as const;

/**
 * Get all tradable symbols
 */
export const getAllSymbols = (): string[] => {
  return [...APP_CONSTANTS.SYMBOLS.STOCKS];
};

/**
 * Check if symbol is valid
 */
export const isValidSymbol = (symbol: string): boolean => {
  return getAllSymbols().includes(symbol.toUpperCase());
};
