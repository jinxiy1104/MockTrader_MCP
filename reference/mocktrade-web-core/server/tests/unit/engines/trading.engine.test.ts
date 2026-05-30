import { TradingEngine } from '../../../src/engines/trading.engine';
import {
  ConflictError,
  EvaluationFrozenError,
  InsufficientFundsError,
  InvalidOrderError,
} from '../../../src/utils/errors';

jest.mock('@repos/trade.repository', () => ({
  tradeRepository: {
    create: jest.fn(),
    findByEvaluationAndSymbol: jest.fn(),
  },
}));

jest.mock('@repos/position.repository', () => ({
  positionRepository: {
    deleteIfClosed: jest.fn(),
    upsert: jest.fn(),
    findByEvaluationAndSymbol: jest.fn(),
    findByEvaluationId: jest.fn(),
    updateUnrealizedPnL: jest.fn(),
    getTotalUnrealizedPnL: jest.fn(),
  },
}));

jest.mock('@repos/evaluation.repository', () => ({
  evaluationRepository: {
    findByIdOrThrow: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@repos/evaluationrule.repository', () => ({
  evaluationRuleRepository: {
    findByIdOrThrow: jest.fn(),
  },
}));

jest.mock('@utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { tradeRepository } = jest.requireMock('@repos/trade.repository');
const { positionRepository } = jest.requireMock('@repos/position.repository');
const { evaluationRepository } = jest.requireMock('@repos/evaluation.repository');
const { evaluationRuleRepository } = jest.requireMock('@repos/evaluationrule.repository');

const decimal = (value: number) => ({
  toString: () => value.toString(),
});

describe('TradingEngine', () => {
  let engine: TradingEngine;

  beforeEach(() => {
    engine = new TradingEngine();
    jest.clearAllMocks();
  });

  describe('executeMarketOrder', () => {
    it('throws when evaluation is not active', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'FROZEN',
      });

      await expect(
        engine.executeMarketOrder({
          evaluationId: 'eval-1',
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          currentPrice: 100,
        })
      ).rejects.toThrow(EvaluationFrozenError);
    });

    it('throws for invalid quantity and price', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'ACTIVE',
      });

      await expect(
        engine.executeMarketOrder({
          evaluationId: 'eval-1',
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 0,
          currentPrice: 100,
        })
      ).rejects.toThrow(InvalidOrderError);

      await expect(
        engine.executeMarketOrder({
          evaluationId: 'eval-1',
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          currentPrice: 0,
        })
      ).rejects.toThrow(InvalidOrderError);
    });

    it('throws when funds are insufficient', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'ACTIVE',
        id: 'eval-1',
        rulesetId: 'rules-1',
        currentBalance: decimal(1),
        equity: decimal(1000),
        initialBalance: decimal(1000),
        peakEquity: decimal(1),
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({
        maxSinglePositionNotional: decimal(200),
      });
      positionRepository.findByEvaluationAndSymbol.mockResolvedValue(null);

      await expect(
        engine.executeMarketOrder({
          evaluationId: 'eval-1',
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          currentPrice: 100,
        })
      ).rejects.toThrow(InsufficientFundsError);
    });

    it('rejects oversell when shorting is not allowed', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'ACTIVE',
        id: 'eval-1',
        rulesetId: 'rules-1',
        currentBalance: decimal(1000),
        equity: decimal(1000),
        initialBalance: decimal(1000),
        peakEquity: decimal(1000),
      });
      positionRepository.findByEvaluationAndSymbol.mockResolvedValue({
        quantity: decimal(1),
      });

      await expect(
        engine.executeMarketOrder({
          evaluationId: 'eval-1',
          symbol: 'AAPL',
          side: 'SELL',
          quantity: 2,
          currentPrice: 100,
        })
      ).rejects.toThrow(ConflictError);

      expect(tradeRepository.create).not.toHaveBeenCalled();
    });

    it('rejects buy orders that would exceed the max single-position notional', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'ACTIVE',
        id: 'eval-1',
        rulesetId: 'rules-1',
        currentBalance: decimal(100000),
        equity: decimal(85000),
        initialBalance: decimal(100000),
        peakEquity: decimal(100000),
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({
        maxSinglePositionNotional: decimal(20000),
      });
      positionRepository.findByEvaluationAndSymbol.mockResolvedValue({
        quantity: decimal(50),
      });

      await expect(
        engine.executeMarketOrder({
          evaluationId: 'eval-1',
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 60,
          currentPrice: 200,
        })
      ).rejects.toThrow('Cannot trade above max single-position notional (20000.00)');

      expect(tradeRepository.create).not.toHaveBeenCalled();
    });

    it('anchors the buy-side position limit to initial balance instead of current equity', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'ACTIVE',
        id: 'eval-1',
        rulesetId: 'rules-1',
        currentBalance: decimal(90000),
        equity: decimal(50000),
        initialBalance: decimal(100000),
        peakEquity: decimal(100000),
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({
        maxSinglePositionNotional: decimal(20000),
      });
      positionRepository.findByEvaluationAndSymbol.mockResolvedValue({
        quantity: decimal(50),
      });
      tradeRepository.create.mockResolvedValue({
        id: BigInt(3),
        executedAt: new Date('2024-01-03T00:00:00Z'),
      });
      positionRepository.findByEvaluationId.mockResolvedValue([
        {
          symbol: 'AAPL',
          quantity: decimal(60),
          avgPrice: decimal(100),
          unrealizedPnl: decimal(0),
          realizedPnl: decimal(0),
        },
      ]);
      jest
        .spyOn(engine as unknown as { updatePosition: () => Promise<void> }, 'updatePosition')
        .mockResolvedValue();

      await engine.executeMarketOrder({
        evaluationId: 'eval-1',
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        currentPrice: 100,
      });

      expect(tradeRepository.create).toHaveBeenCalled();
    });

    it('creates trade and updates evaluation on success', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'ACTIVE',
        id: 'eval-1',
        rulesetId: 'rules-1',
        currentBalance: decimal(1000),
        equity: decimal(1000),
        initialBalance: decimal(1000),
        peakEquity: decimal(1000),
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({
        maxSinglePositionNotional: decimal(200),
      });
      positionRepository.findByEvaluationAndSymbol.mockResolvedValue(null);
      positionRepository.findByEvaluationId.mockResolvedValue([
        {
          symbol: 'AAPL',
          quantity: decimal(2),
          avgPrice: decimal(100.01),
          unrealizedPnl: decimal(0),
          realizedPnl: decimal(-0.20002),
        },
      ]);
      tradeRepository.create.mockResolvedValue({
        id: BigInt(1),
        executedAt: new Date('2024-01-01T00:00:00Z'),
      });
      jest
        .spyOn(engine as unknown as { updatePosition: () => Promise<void> }, 'updatePosition')
        .mockResolvedValue();

      const result = await engine.executeMarketOrder({
        evaluationId: 'eval-1',
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 2,
        currentPrice: 100,
      });

      expect(tradeRepository.create).toHaveBeenCalledWith({
        evaluationId: 'eval-1',
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 2,
        price: 100.01,
        fee: 0.20002,
        source: 'USER',
      }, undefined);
      expect(evaluationRepository.update).toHaveBeenCalledWith('eval-1', {
        currentBalance: 1000 - (200.02 + 0.20002),
        equity: 999.79998,
        peakEquity: 1000,
      }, undefined);
      expect(result).toEqual({
        tradeId: BigInt(1),
        evaluationId: 'eval-1',
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 2,
        executedPrice: 100.01,
        fee: 0.20002,
        executedAt: new Date('2024-01-01T00:00:00Z'),
        newBalance: 1000 - (200.02 + 0.20002),
        newEquity: 999.79998,
      });
    });

    it('allows sell orders without applying the buy-side position limit', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        status: 'ACTIVE',
        id: 'eval-1',
        rulesetId: 'rules-1',
        currentBalance: decimal(1000),
        equity: decimal(1000),
        initialBalance: decimal(1000),
        peakEquity: decimal(1000),
      });
      positionRepository.findByEvaluationAndSymbol.mockResolvedValue({
        quantity: decimal(5),
      });
      tradeRepository.create.mockResolvedValue({
        id: BigInt(2),
        executedAt: new Date('2024-01-02T00:00:00Z'),
      });
      positionRepository.findByEvaluationId.mockResolvedValue([
        {
          symbol: 'AAPL',
          quantity: decimal(4),
          avgPrice: decimal(100),
          unrealizedPnl: decimal(0),
          realizedPnl: decimal(0),
        },
      ]);
      jest
        .spyOn(engine as unknown as { updatePosition: () => Promise<void> }, 'updatePosition')
        .mockResolvedValue();

      await engine.executeMarketOrder({
        evaluationId: 'eval-1',
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 1,
        currentPrice: 100,
      });

      expect(evaluationRuleRepository.findByIdOrThrow).not.toHaveBeenCalled();
      expect(tradeRepository.create).toHaveBeenCalled();
    });
  });

  describe('updatePosition', () => {
    it('deletes position when closed', async () => {
      tradeRepository.findByEvaluationAndSymbol.mockResolvedValue([
        { side: 'BUY', quantity: decimal(1), price: decimal(100), fee: decimal(1) },
        { side: 'SELL', quantity: decimal(1), price: decimal(100), fee: decimal(1) },
      ]);

      await (engine as unknown as {
        updatePosition: (evaluationId: string, symbol: string) => Promise<void>;
      }).updatePosition('eval-1', 'AAPL');

      expect(positionRepository.deleteIfClosed).toHaveBeenCalledWith('eval-1', 'AAPL', undefined);
      expect(positionRepository.upsert).not.toHaveBeenCalled();
    });

    it('upserts position when quantity remains', async () => {
      tradeRepository.findByEvaluationAndSymbol.mockResolvedValue([
        { side: 'BUY', quantity: decimal(2), price: decimal(100), fee: decimal(1) },
        { side: 'SELL', quantity: decimal(1), price: decimal(110), fee: decimal(1) },
      ]);

      await (engine as unknown as {
        updatePosition: (evaluationId: string, symbol: string) => Promise<void>;
      }).updatePosition('eval-1', 'AAPL');

      expect(positionRepository.upsert).toHaveBeenCalledWith({
        evaluationId: 'eval-1',
        symbol: 'AAPL',
        quantity: 1,
        avgPrice: 100,
        unrealizedPnl: 0,
        realizedPnl: 8,
      }, undefined);
    });
  });

  describe('markToMarket', () => {
    it('updates unrealized PnL and equity', async () => {
      positionRepository.findByEvaluationId.mockResolvedValue([
        { symbol: 'AAPL', quantity: decimal(2), avgPrice: decimal(100), unrealizedPnl: decimal(0) },
        { symbol: 'TSLA', quantity: decimal(1), avgPrice: decimal(200), unrealizedPnl: decimal(0) },
      ]);
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        currentBalance: decimal(1000),
        peakEquity: decimal(1000),
      });
      positionRepository.getTotalUnrealizedPnL.mockResolvedValue(50);

      await engine.markToMarket(
        'eval-1',
        new Map([
          ['AAPL', 110],
        ])
      );

      expect(positionRepository.updateUnrealizedPnL).toHaveBeenCalledWith(
        'eval-1',
        'AAPL',
        2 * (110 - 100),
        undefined
      );
      expect(positionRepository.updateUnrealizedPnL).toHaveBeenCalledTimes(1);
      expect(evaluationRepository.update).toHaveBeenCalledWith('eval-1', {
        equity: 1420,
        peakEquity: 1420,
      }, undefined);
    });
  });
});
