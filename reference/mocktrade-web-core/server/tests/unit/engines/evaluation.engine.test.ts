import { EvaluationEngine } from '../../../src/engines/evaluation.engine';

jest.mock('@repos/evaluation.repository', () => ({
  evaluationRepository: {
    findByIdOrThrow: jest.fn(),
    findExpiredActive: jest.fn(),
    updateStatus: jest.fn(),
    settleFinalStatus: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@repos/evaluationrule.repository', () => ({
  evaluationRuleRepository: {
    findByIdOrThrow: jest.fn(),
  },
}));

jest.mock('@repos/ruleviolation.repository', () => ({
  ruleViolationRepository: {
    create: jest.fn(),
    findByEvaluationId: jest.fn(),
  },
}));

jest.mock('@repos/trade.repository', () => ({
  tradeRepository: {
    findByEvaluationId: jest.fn(),
    findTodayTrades: jest.fn(),
    countDistinctTradingDays: jest.fn(),
  },
}));

jest.mock('@repos/position.repository', () => ({
  positionRepository: {
    findByEvaluationId: jest.fn(),
  },
}));

jest.mock('@services/market.service', () => ({
  marketDataService: {
    getPrices: jest.fn(),
  },
}));

jest.mock('@rules/rule-validator-registry', () => ({
  ruleValidatorRegistry: {
    validateAll: jest.fn(),
    checkPassConditions: jest.fn(),
  },
}));

jest.mock('@utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const { evaluationRepository } = jest.requireMock('@repos/evaluation.repository');
const { evaluationRuleRepository } = jest.requireMock('@repos/evaluationrule.repository');
const { ruleViolationRepository } = jest.requireMock('@repos/ruleviolation.repository');
const { tradeRepository } = jest.requireMock('@repos/trade.repository');
const { positionRepository } = jest.requireMock('@repos/position.repository');
const { ruleValidatorRegistry } = jest.requireMock('@rules/rule-validator-registry');
const { marketDataService } = jest.requireMock('@services/market.service');

const decimal = (value: number) => ({
  toString: () => value.toString(),
});

describe('EvaluationEngine', () => {
  let engine: EvaluationEngine;

  beforeEach(() => {
    engine = new EvaluationEngine();
    jest.clearAllMocks();
  });

  describe('evaluateAccount', () => {
    it('records violations and fails an active evaluation', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        id: 'eval-1',
        rulesetId: 'rules-1',
        status: 'ACTIVE',
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({ id: 'rules-1' });
      jest
        .spyOn(engine as any, 'calculateMetrics')
        .mockResolvedValue({ currentEquity: 0 });
      ruleValidatorRegistry.validateAll.mockReturnValue([
        {
          ruleType: 'MAX_DRAWDOWN',
          value: 12000,
          threshold: 10000,
          message: 'Exceeded max drawdown',
        },
      ]);

      const result = await engine.evaluateAccount('eval-1');

      expect(ruleViolationRepository.create).toHaveBeenCalledWith({
        evaluationId: 'eval-1',
        ruleType: 'MAX_DRAWDOWN',
        value: 12000,
        threshold: 10000,
      }, undefined);
      expect(evaluationRepository.updateStatus).toHaveBeenCalledWith(
        'eval-1',
        'FAILED',
        undefined,
        'RULE_FAIL'
      );
      expect(result).toEqual({
        passed: false,
        violations: [
          {
            ruleType: 'MAX_DRAWDOWN',
            value: 12000,
            threshold: 10000,
            message: 'Exceeded max drawdown',
          },
        ],
        newStatus: 'FAILED',
      });
    });

    it('does not update status when evaluation is not active', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        id: 'eval-1',
        rulesetId: 'rules-1',
        status: 'FROZEN',
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({ id: 'rules-1' });
      jest
        .spyOn(engine as any, 'calculateMetrics')
        .mockResolvedValue({ currentEquity: 0 });
      ruleValidatorRegistry.validateAll.mockReturnValue([
        {
          ruleType: 'DAILY_LOSS_LIMIT',
          value: 6000,
          threshold: 5000,
          message: 'Daily loss limit breached',
        },
      ]);

      const result = await engine.evaluateAccount('eval-1');

      expect(evaluationRepository.updateStatus).not.toHaveBeenCalled();
      expect(result.newStatus).toBe('FAILED');
    });

    it('passes and updates status when pass conditions are met', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        id: 'eval-1',
        rulesetId: 'rules-1',
        status: 'ACTIVE',
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({ id: 'rules-1' });
      jest
        .spyOn(engine as any, 'calculateMetrics')
        .mockResolvedValue({ currentEquity: 110000 });
      ruleValidatorRegistry.validateAll.mockReturnValue([]);
      ruleValidatorRegistry.checkPassConditions.mockReturnValue(true);

      const result = await engine.evaluateAccount('eval-1');

      expect(evaluationRepository.updateStatus).toHaveBeenCalledWith(
        'eval-1',
        'PASSED',
        undefined,
        'MANUAL'
      );
      expect(result.newStatus).toBe('PASSED');
    });

    it('returns ACTIVE when no violations and pass conditions are not met', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        id: 'eval-1',
        rulesetId: 'rules-1',
        status: 'ACTIVE',
      });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({ id: 'rules-1' });
      jest
        .spyOn(engine as any, 'calculateMetrics')
        .mockResolvedValue({ currentEquity: 90000 });
      ruleValidatorRegistry.validateAll.mockReturnValue([]);
      ruleValidatorRegistry.checkPassConditions.mockReturnValue(false);

      const result = await engine.evaluateAccount('eval-1');

      expect(evaluationRepository.updateStatus).not.toHaveBeenCalled();
      expect(result.newStatus).toBe('ACTIVE');
    });

    it('uses persisted peak equity for deterministic drawdown checks', async () => {
      evaluationRepository.findByIdOrThrow
        .mockResolvedValueOnce({
          id: 'eval-1',
          rulesetId: 'rules-1',
          status: 'ACTIVE',
        })
        .mockResolvedValueOnce({
          currentBalance: decimal(99000),
          equity: decimal(99000),
          initialBalance: decimal(100000),
          peakEquity: decimal(101000),
        });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({
        id: 'rules-1',
        name: 'strict',
        maxDrawdown: decimal(1500),
      });
      tradeRepository.findByEvaluationId.mockResolvedValue([]);
      tradeRepository.findTodayTrades.mockResolvedValue([]);
      tradeRepository.countDistinctTradingDays.mockResolvedValue(0);
      positionRepository.findByEvaluationId.mockResolvedValue([]);
      ruleValidatorRegistry.validateAll.mockImplementation((metrics: any) => {
        expect(metrics.currentDrawdown).toBe(2000);
        return [
          {
            ruleType: 'MAX_DRAWDOWN',
            value: metrics.currentDrawdown,
            threshold: 1500,
            message: 'Max drawdown exceeded',
          },
        ];
      });
      ruleValidatorRegistry.checkPassConditions.mockReturnValue(false);

      const result = await engine.evaluateAccount('eval-1');

      expect(ruleViolationRepository.create).toHaveBeenCalledWith(
        {
          evaluationId: 'eval-1',
          ruleType: 'MAX_DRAWDOWN',
          value: 2000,
          threshold: 1500,
        },
        undefined
      );
      expect(evaluationRepository.updateStatus).toHaveBeenCalledWith(
        'eval-1',
        'FAILED',
        undefined,
        'RULE_FAIL'
      );
      expect(result.newStatus).toBe('FAILED');
    });
  });

  describe('calculateMetrics', () => {
    it('calculates drawdown, leverage, daily PnL, and trading days', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        currentBalance: decimal(90000),
        equity: decimal(95000),
        initialBalance: decimal(100000),
        peakEquity: decimal(100000),
      });
      tradeRepository.findByEvaluationId.mockResolvedValue([
        { executedAt: new Date('2024-01-01T10:00:00Z') },
        { executedAt: new Date('2024-01-01T12:00:00Z') },
        { executedAt: new Date('2024-01-02T09:00:00Z') },
      ]);
      tradeRepository.countDistinctTradingDays.mockResolvedValue(2);
      tradeRepository.findTodayTrades.mockResolvedValue([
        { symbol: 'AAPL', side: 'BUY', quantity: decimal(1), price: decimal(100), fee: decimal(1) },
        { symbol: 'AAPL', side: 'SELL', quantity: decimal(1), price: decimal(110), fee: decimal(1) },
      ]);
      marketDataService.getPrices.mockResolvedValue(new Map([['AAPL', 110]]));
      positionRepository.findByEvaluationId.mockResolvedValue([
        { quantity: decimal(10), avgPrice: decimal(100) },
      ]);

      const metrics = await (engine as unknown as {
        calculateMetrics: (id: string) => Promise<Record<string, number>>;
      }).calculateMetrics('eval-1');

      expect(metrics.currentEquity).toBe(95000);
      expect(metrics.peakEquity).toBe(100000);
      expect(metrics.currentDrawdown).toBe(5000);
      expect(metrics.dailyPnL).toBe(8);
      expect(metrics.totalPnL).toBe(-5000);
      expect(metrics.openPositionsValue).toBe(1000);
      expect(metrics.leverage).toBeCloseTo(1000 / 95000, 6);
      expect(metrics.tradingDays).toBe(2);
    });

    it('does not treat same-day buys as full daily loss', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({
        currentBalance: decimal(74711.210374),
        equity: decimal(99974.736474),
        initialBalance: decimal(100000),
        peakEquity: decimal(100000),
      });
      tradeRepository.findTodayTrades.mockResolvedValue([
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: decimal(100),
          price: decimal(252.635261),
          fee: decimal(25.263526),
        },
      ]);
      marketDataService.getPrices.mockResolvedValue(new Map([['AAPL', 252.635261]]));
      positionRepository.findByEvaluationId.mockResolvedValue([
        { quantity: decimal(100), avgPrice: decimal(252.635261) },
      ]);
      tradeRepository.countDistinctTradingDays.mockResolvedValue(1);

      const metrics = await (engine as unknown as {
        calculateMetrics: (id: string) => Promise<Record<string, number>>;
      }).calculateMetrics('eval-1');

      expect(metrics.dailyPnL).toBeCloseTo(-25.263526, 6);
      expect(metrics.totalPnL).toBeCloseTo(-25.263526, 6);
    });
  });

  describe('getEvaluationStatus', () => {
    it('returns evaluation, rules, metrics, and violations', async () => {
      evaluationRepository.findByIdOrThrow.mockResolvedValue({ id: 'eval-1', rulesetId: 'rules-1' });
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({ id: 'rules-1' });
      ruleViolationRepository.findByEvaluationId.mockResolvedValue([{ id: 'v-1' }]);
      jest
        .spyOn(engine as any, 'calculateMetrics')
        .mockResolvedValue({ currentEquity: 100000 });

      const result = await engine.getEvaluationStatus('eval-1');

      expect(result.evaluation).toEqual({ id: 'eval-1', rulesetId: 'rules-1' });
      expect(result.rules).toEqual({ id: 'rules-1' });
      expect(result.metrics).toEqual({ currentEquity: 100000 });
      expect(result.violations).toEqual([{ id: 'v-1' }]);
    });
  });

  describe('freezeAccount / unfreezeAccount', () => {
    it('freezes and unfreezes an evaluation', async () => {
      await engine.freezeAccount('eval-1');
      await engine.unfreezeAccount('eval-1');

      expect(evaluationRepository.updateStatus).toHaveBeenCalledWith('eval-1', 'FROZEN', undefined);
      expect(evaluationRepository.updateStatus).toHaveBeenCalledWith('eval-1', 'ACTIVE', undefined);
    });
  });

  describe('settleExpiredEvaluations', () => {
    it('settles expired active evaluation to PASSED when pass conditions met', async () => {
      evaluationRepository.findExpiredActive.mockResolvedValue([
        {
          id: 'eval-expired-pass',
          status: 'ACTIVE',
          rulesetId: 'rules-1',
          settledAt: null,
        },
      ]);
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({ id: 'rules-1' });
      jest.spyOn(engine as any, 'calculateMetrics').mockResolvedValue({ currentEquity: 120000 });
      ruleValidatorRegistry.checkPassConditions.mockReturnValue(true);

      const settledCount = await engine.settleExpiredEvaluations(
        new Date('2026-02-22T00:00:00.000Z')
      );

      expect(settledCount).toBe(1);
      expect(evaluationRepository.settleFinalStatus).toHaveBeenCalledWith(
        'eval-expired-pass',
        'PASSED',
        'EXPIRED_PASS',
        undefined
      );
    });

    it('settles expired active evaluation to FAILED when pass conditions are not met', async () => {
      evaluationRepository.findExpiredActive.mockResolvedValue([
        {
          id: 'eval-expired-fail',
          status: 'ACTIVE',
          rulesetId: 'rules-1',
          settledAt: null,
        },
      ]);
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({ id: 'rules-1' });
      jest.spyOn(engine as any, 'calculateMetrics').mockResolvedValue({ currentEquity: 99000 });
      ruleValidatorRegistry.checkPassConditions.mockReturnValue(false);

      const settledCount = await engine.settleExpiredEvaluations(
        new Date('2026-02-22T00:00:00.000Z')
      );

      expect(settledCount).toBe(1);
      expect(evaluationRepository.settleFinalStatus).toHaveBeenCalledWith(
        'eval-expired-fail',
        'FAILED',
        'EXPIRED_FAIL',
        undefined
      );
    });

    it('enforces min trading days using distinct trade dates', async () => {
      evaluationRepository.findExpiredActive.mockResolvedValue([
        {
          id: 'eval-expired-min-days',
          status: 'ACTIVE',
          rulesetId: 'rules-1',
          settledAt: null,
        },
      ]);
      evaluationRuleRepository.findByIdOrThrow.mockResolvedValue({
        id: 'rules-1',
        profitTarget: decimal(500),
        minTradingDays: 2,
      });
      jest.spyOn(engine as any, 'calculateMetrics').mockResolvedValue({
        totalPnL: 1000,
        tradingDays: 1,
      });
      ruleValidatorRegistry.checkPassConditions.mockImplementation((metrics: any, rules: any) => {
        return metrics.totalPnL >= rules.profitTarget && metrics.tradingDays >= rules.minTradingDays;
      });

      const settledCount = await engine.settleExpiredEvaluations(
        new Date('2026-02-22T00:00:00.000Z')
      );

      expect(settledCount).toBe(1);
      expect(evaluationRepository.settleFinalStatus).toHaveBeenCalledWith(
        'eval-expired-min-days',
        'FAILED',
        'EXPIRED_FAIL',
        undefined
      );
    });

    it('keeps failed evaluations as failed with RULE_FAIL reason', async () => {
      evaluationRepository.findExpiredActive.mockResolvedValue([
        {
          id: 'eval-failed',
          status: 'FAILED',
          rulesetId: 'rules-1',
          settledAt: null,
        },
      ]);

      const settledCount = await engine.settleExpiredEvaluations(
        new Date('2026-02-22T00:00:00.000Z')
      );

      expect(settledCount).toBe(1);
      expect(evaluationRepository.settleFinalStatus).toHaveBeenCalledWith(
        'eval-failed',
        'FAILED',
        'RULE_FAIL',
        undefined
      );
    });
  });
});
