import { Position, Trade } from '../domain/types.js';

interface RebuildOptions {
  evaluationId: string;
  trades: Trade[];
  getCurrentPrice: (symbol: string) => number;
}

export function rebuildPositions({ evaluationId, trades, getCurrentPrice }: RebuildOptions): Position[] {
  const positions = new Map<string, Position>();

  for (const trade of trades) {
    let position = positions.get(trade.symbol);
    if (!position) {
      const currentPrice = getCurrentPrice(trade.symbol);
      position = {
        evaluationId,
        symbol: trade.symbol,
        quantity: 0,
        avgPrice: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        currentPrice,
        marketValue: 0,
      };
    }

    if (trade.side === 'BUY') {
      const totalCost = position.quantity * position.avgPrice + trade.quantity * trade.price;
      const newQuantity = position.quantity + trade.quantity;
      position.avgPrice = newQuantity > 0 ? totalCost / newQuantity : 0;
      position.quantity = newQuantity;
      position.realizedPnl -= trade.fee;
    } else if (position.quantity > 0) {
      const sellQuantity = Math.min(trade.quantity, position.quantity);
      const pnl = sellQuantity * (trade.price - position.avgPrice);
      position.realizedPnl += pnl - trade.fee;
      position.quantity -= sellQuantity;
    }

    positions.set(trade.symbol, position);
  }

  return [...positions.values()]
    .filter((position) => position.quantity > 0)
    .map((position) => {
      const currentPrice = getCurrentPrice(position.symbol);
      return {
        ...position,
        currentPrice,
        unrealizedPnl: roundMoney(position.quantity * (currentPrice - position.avgPrice)),
        marketValue: roundMoney(position.quantity * currentPrice),
      };
    });
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}
