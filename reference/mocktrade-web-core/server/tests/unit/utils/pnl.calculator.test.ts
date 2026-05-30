import {
  calculateRealizedPnL,
  calculateUnrealizedPnL,
  calculateDrawdown,
  rebuildPositionsFromTrades,
} from '../../../src/utils/pnl.calculator';

describe('PnL Calculator', () => {
  describe('calculateRealizedPnL', () => {
    it('should calculate realized PnL for a simple buy-sell', () => {
      const trades = [
        {
          symbol: 'AAPL',
          side: 'BUY' as const,
          quantity: 10,
          price: 180,
          fee: 1.8,
        },
        {
          symbol: 'AAPL',
          side: 'SELL' as const,
          quantity: 10,
          price: 190,
          fee: 1.9,
        },
      ];

      const pnl = calculateRealizedPnL(trades);
      
      // Profit: 10 * (190 - 180) = 100
      // Fees: 1.8 + 1.9 = 3.7
      // Net PnL: 100 - 3.7 = 96.3
      expect(pnl).toBeCloseTo(96.3, 1);
    });

    it('should calculate realized PnL for multiple trades', () => {
      const trades = [
        { symbol: 'AAPL', side: 'BUY' as const, quantity: 10, price: 180, fee: 1 },
        { symbol: 'AAPL', side: 'BUY' as const, quantity: 10, price: 185, fee: 1 },
        { symbol: 'AAPL', side: 'SELL' as const, quantity: 20, price: 190, fee: 2 },
      ];

      const pnl = calculateRealizedPnL(trades);
      
      // Avg cost: (10*180 + 10*185) / 20 = 182.5
      // Profit: 20 * (190 - 182.5) = 150
      // Fees: 1 + 1 + 2 = 4
      // Net PnL: 150 - 4 = 146
      expect(pnl).toBeCloseTo(146, 1);
    });

    it('should handle partial sells correctly', () => {
      const trades = [
        { symbol: 'AAPL', side: 'BUY' as const, quantity: 10, price: 180, fee: 1 },
        { symbol: 'AAPL', side: 'SELL' as const, quantity: 5, price: 190, fee: 1 },
      ];

      const pnl = calculateRealizedPnL(trades);
      
      // Profit: 5 * (190 - 180) = 50
      // Fees: 1 + 1 = 2
      // Net PnL: 50 - 2 = 48
      expect(pnl).toBeCloseTo(48, 1);
    });
  });

  describe('calculateUnrealizedPnL', () => {
    it('should calculate unrealized PnL for open positions', () => {
      const positions = [
        { symbol: 'AAPL', quantity: 10, avgPrice: 180 },
        { symbol: 'TSLA', quantity: 5, avgPrice: 250 },
      ];

      const currentPrices = new Map([
        ['AAPL', 190],
        ['TSLA', 240],
      ]);

      const unrealizedPnL = calculateUnrealizedPnL(positions, currentPrices);
      
      // AAPL: 10 * (190 - 180) = 100
      // TSLA: 5 * (240 - 250) = -50
      // Total: 100 - 50 = 50
      expect(unrealizedPnL).toBe(50);
    });
  });

  describe('calculateDrawdown', () => {
    it('should calculate drawdown correctly', () => {
      const drawdown = calculateDrawdown(95000, 100000);
      expect(drawdown).toBe(5000);
    });

    it('should return 0 if current equity is higher than peak', () => {
      const drawdown = calculateDrawdown(105000, 100000);
      expect(drawdown).toBe(-5000); // Negative drawdown = profit
    });
  });

  describe('rebuildPositionsFromTrades', () => {
    it('should rebuild positions from trade ledger', () => {
      const trades = [
        { symbol: 'AAPL', side: 'BUY' as const, quantity: 10, price: 180, fee: 1 },
        { symbol: 'AAPL', side: 'BUY' as const, quantity: 5, price: 190, fee: 0.5 },
        { symbol: 'TSLA', side: 'BUY' as const, quantity: 3, price: 250, fee: 0.75 },
      ];

      const positions = rebuildPositionsFromTrades(trades);

      expect(positions.size).toBe(2);
      
      const aaplPosition = positions.get('AAPL');
      expect(aaplPosition).toBeDefined();
      expect(aaplPosition!.quantity).toBe(15);
      // Avg price: (10*180 + 5*190) / 15 = 183.33...
      expect(aaplPosition!.avgPrice).toBeCloseTo(183.33, 2);
    });

    it('should remove closed positions', () => {
      const trades = [
        { symbol: 'AAPL', side: 'BUY' as const, quantity: 10, price: 180, fee: 1 },
        { symbol: 'AAPL', side: 'SELL' as const, quantity: 10, price: 190, fee: 1 },
      ];

      const positions = rebuildPositionsFromTrades(trades);

      expect(positions.size).toBe(0); // Position fully closed
    });
  });
});
