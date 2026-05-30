import { Prisma } from '@prisma/client';

/**
 * PnL Calculation Utilities
 * 
 * These are pure functions for calculating profit/loss metrics.
 * They operate on the immutable trade ledger.
 */

export interface Trade {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number | Prisma.Decimal;
  price: number | Prisma.Decimal;
  fee: number | Prisma.Decimal;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

/**
 * Convert Decimal to number for calculations
 */
const toNumber = (value: number | Prisma.Decimal): number => {
  if (typeof value === 'number') return value;
  return parseFloat(value.toString());
};

/**
 * Calculate realized PnL from a list of trades
 */
export const calculateRealizedPnL = (trades: Trade[]): number => {
  let totalRealizedPnL = 0;
  const positions: Map<string, { quantity: number; avgCost: number }> = new Map();

  for (const trade of trades) {
    const symbol = trade.symbol;
    const quantity = toNumber(trade.quantity);
    const price = toNumber(trade.price);
    const fee = toNumber(trade.fee);
    const side = trade.side;

    const position = positions.get(symbol) || { quantity: 0, avgCost: 0 };

    if (side === 'BUY') {
      // Add to position
      const totalCost = position.quantity * position.avgCost + quantity * price;
      const newQuantity = position.quantity + quantity;
      position.avgCost = newQuantity > 0 ? totalCost / newQuantity : 0;
      position.quantity = newQuantity;
      totalRealizedPnL -= fee; // Fees reduce realized PnL
    } else {
      // SELL - close or reduce position
      if (position.quantity > 0) {
        const sellQuantity = Math.min(quantity, position.quantity);
        const pnl = sellQuantity * (price - position.avgCost);
        totalRealizedPnL += pnl - fee;
        position.quantity -= sellQuantity;
      } else {
        // Short position (not typically allowed in evaluation, but handle it)
        const totalCost = Math.abs(position.quantity) * position.avgCost + quantity * price;
        const newQuantity = position.quantity - quantity;
        position.avgCost = newQuantity !== 0 ? totalCost / Math.abs(newQuantity) : 0;
        position.quantity = newQuantity;
        totalRealizedPnL -= fee;
      }
    }

    positions.set(symbol, position);
  }

  return totalRealizedPnL;
};

/**
 * Calculate unrealized PnL for open positions
 */
export const calculateUnrealizedPnL = (
  positions: { symbol: string; quantity: number; avgPrice: number }[],
  currentPrices: Map<string, number>
): number => {
  let totalUnrealizedPnL = 0;

  for (const position of positions) {
    const currentPrice = currentPrices.get(position.symbol) || position.avgPrice;
    const unrealizedPnL = position.quantity * (currentPrice - position.avgPrice);
    totalUnrealizedPnL += unrealizedPnL;
  }

  return totalUnrealizedPnL;
};

/**
 * Calculate total equity (cash + open-position market value)
 */
export const calculateEquity = (
  currentBalance: number,
  openPositionsMarketValue: number
): number => {
  return currentBalance + openPositionsMarketValue;
};

/**
 * Calculate drawdown from peak equity
 */
export const calculateDrawdown = (currentEquity: number, peakEquity: number): number => {
  if (peakEquity <= 0) return 0;
  return peakEquity - currentEquity;
};

/**
 * Calculate drawdown percentage
 */
export const calculateDrawdownPercentage = (currentEquity: number, peakEquity: number): number => {
  if (peakEquity <= 0) return 0;
  return ((peakEquity - currentEquity) / peakEquity) * 100;
};

/**
 * Rebuild positions from trade ledger (cache rebuild)
 */
export const rebuildPositionsFromTrades = (trades: Trade[]): Map<string, Position> => {
  const positions = new Map<string, Position>();

  for (const trade of trades) {
    const symbol = trade.symbol;
    const quantity = toNumber(trade.quantity);
    const price = toNumber(trade.price);
    const fee = toNumber(trade.fee);
    const side = trade.side;

    let position = positions.get(symbol);
    if (!position) {
      position = {
        symbol,
        quantity: 0,
        avgPrice: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
      };
    }

    if (side === 'BUY') {
      const totalCost = position.quantity * position.avgPrice + quantity * price;
      const newQuantity = position.quantity + quantity;
      position.avgPrice = newQuantity > 0 ? totalCost / newQuantity : 0;
      position.quantity = newQuantity;
      position.realizedPnl -= fee;
    } else {
      // SELL
      if (position.quantity > 0) {
        const sellQuantity = Math.min(quantity, position.quantity);
        const pnl = sellQuantity * (price - position.avgPrice);
        position.realizedPnl += pnl - fee;
        position.quantity -= sellQuantity;
      }
    }

    positions.set(symbol, position);
  }

  // Remove closed positions (quantity = 0)
  for (const [symbol, position] of positions.entries()) {
    if (position.quantity === 0) {
      positions.delete(symbol);
    }
  }

  return positions;
};
