import { Prisma, PrismaClient } from '@prisma/client';
import { evaluationRepository } from '@repos/evaluation.repository';
import { evaluationRuleRepository } from '@repos/evaluationrule.repository';
import { positionRepository } from '@repos/position.repository';
import { ruleViolationRepository } from '@repos/ruleviolation.repository';
import { tradeRepository } from '@repos/trade.repository';
import { ruleValidatorRegistry } from '@rules/rule-validator-registry';
import { EvaluationMetrics, RuleCheckResult, RuleSet, RuleViolation } from '@rules/types';
import { marketDataService } from '@services/market.service';
import { logger } from '@utils/logger';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Evaluation Engine
 * Continuously evaluates trading performance against rules.
 */
export class EvaluationEngine {
  async evaluateAccount(
    evaluationId: string,
    dbClient?: DbClient
  ): Promise<RuleCheckResult> {
    logger.info('Evaluating account', { evaluationId });

    const evaluation = await evaluationRepository.findByIdOrThrow(evaluationId, dbClient);
    const rules = await evaluationRuleRepository.findByIdOrThrow(
      evaluation.rulesetId,
      dbClient
    );
    const normalizedRules = this.normalizeRuleSet(rules);

    const metrics = await this.calculateMetrics(evaluationId, dbClient);
    const violations = ruleValidatorRegistry.validateAll(metrics, normalizedRules);

    if (violations.length > 0) {
      if (evaluation.status === 'ACTIVE') {
        for (const violation of violations) {
          await ruleViolationRepository.create(
            {
              evaluationId,
              ruleType: violation.ruleType,
              value: violation.value,
              threshold: violation.threshold,
            },
            dbClient
          );
        }

        await evaluationRepository.updateStatus(
          evaluationId,
          'FAILED',
          dbClient,
          'RULE_FAIL'
        );
        logger.warn('Evaluation FAILED due to violations', {
          evaluationId,
          violations,
        });
      }

      return {
        passed: false,
        violations: violations.map((v: RuleViolation) => ({
          ruleType: v.ruleType,
          value: v.value,
          threshold: v.threshold,
          message: v.message,
        })),
        newStatus: 'FAILED',
      };
    }

    const passConditionsMet = ruleValidatorRegistry.checkPassConditions(
      metrics,
      normalizedRules
    );

    if (passConditionsMet && evaluation.status === 'ACTIVE') {
      await evaluationRepository.updateStatus(
        evaluationId,
        'PASSED',
        dbClient,
        'MANUAL'
      );
      logger.info('Evaluation PASSED', { evaluationId, metrics });

      return {
        passed: true,
        violations: [],
        newStatus: 'PASSED',
      };
    }

    return {
      passed: true,
      violations: [],
      newStatus: 'ACTIVE',
    };
  }

  async settleExpiredEvaluations(now: Date, dbClient?: DbClient): Promise<number> {
    const expired = await evaluationRepository.findExpiredActive(now, dbClient);

    let settledCount = 0;
    for (const evaluation of expired) {
      // Guard for immutable settled records.
      if ((evaluation as any).settledAt) {
        continue;
      }

      if (evaluation.status === 'FAILED') {
        await evaluationRepository.settleFinalStatus(
          evaluation.id,
          'FAILED',
          'RULE_FAIL',
          dbClient
        );
        settledCount += 1;
        continue;
      }

      const rules = await evaluationRuleRepository.findByIdOrThrow(
        evaluation.rulesetId,
        dbClient
      );
      const normalizedRules = this.normalizeRuleSet(rules);
      const metrics = await this.calculateMetrics(evaluation.id, dbClient);

      const passConditionsMet = ruleValidatorRegistry.checkPassConditions(
        metrics,
        normalizedRules
      );

      if (passConditionsMet) {
        await evaluationRepository.settleFinalStatus(
          evaluation.id,
          'PASSED',
          'EXPIRED_PASS',
          dbClient
        );
      } else {
        await evaluationRepository.settleFinalStatus(
          evaluation.id,
          'FAILED',
          'EXPIRED_FAIL',
          dbClient
        );
      }

      settledCount += 1;
    }

    return settledCount;
  }

  private async calculateMetrics(
    evaluationId: string,
    dbClient?: DbClient
  ): Promise<EvaluationMetrics> {
    const evaluation = await evaluationRepository.findByIdOrThrow(evaluationId, dbClient);
    const positions = await positionRepository.findByEvaluationId(evaluationId, dbClient);

    const currentEquity = parseFloat(evaluation.equity.toString());
    const initialBalance = parseFloat(evaluation.initialBalance.toString());
    const persistedPeakEquity = parseFloat((evaluation as any).peakEquity.toString());

    const peakEquity = Math.max(persistedPeakEquity, initialBalance);
    const currentDrawdown = peakEquity - currentEquity;

    const todayTrades = await tradeRepository.findTodayTrades(evaluationId, dbClient);
    const intradaySymbols = Array.from(new Set(todayTrades.map((trade) => trade.symbol)));
    const currentPrices = intradaySymbols.length > 0
      ? await marketDataService.getPrices(intradaySymbols)
      : new Map<string, number>();

    let dailyPnL = 0;
    for (const trade of todayTrades) {
      const quantity = parseFloat(trade.quantity.toString());
      const price = parseFloat(trade.price.toString());
      const fee = parseFloat(trade.fee.toString());
      const currentPrice = currentPrices.get(trade.symbol) ?? price;

      if (trade.side === 'BUY') {
        dailyPnL += quantity * (currentPrice - price) - fee;
      } else {
        dailyPnL += quantity * (price - currentPrice) - fee;
      }
    }

    const totalPnL = currentEquity - initialBalance;

    let openPositionsValue = 0;
    for (const position of positions) {
      const quantity = parseFloat(position.quantity.toString());
      const avgPrice = parseFloat(position.avgPrice.toString());
      openPositionsValue += Math.abs(quantity * avgPrice);
    }

    const leverage = currentEquity > 0 ? openPositionsValue / currentEquity : 0;
    const tradingDays = await tradeRepository.countDistinctTradingDays(
      evaluationId,
      dbClient
    );

    return {
      currentEquity,
      peakEquity,
      currentDrawdown,
      dailyPnL,
      totalPnL,
      openPositionsValue,
      leverage,
      tradingDays,
    };
  }

  private normalizeRuleSet(rules: {
    id: string;
    name: string;
    maxDrawdown?: { toString: () => string } | null;
    dailyLossLimit?: { toString: () => string } | null;
    profitTarget?: { toString: () => string } | null;
    maxSinglePositionNotional?: { toString: () => string } | null;
    leverageLimit?: { toString: () => string } | null;
    minTradingDays?: number | null;
  }): RuleSet {
    const toNumber = (value?: { toString: () => string } | null) =>
      value === null || value === undefined ? undefined : parseFloat(value.toString());

    return {
      id: rules.id,
      name: rules.name,
      maxDrawdown: toNumber(rules.maxDrawdown),
      dailyLossLimit: toNumber(rules.dailyLossLimit),
      profitTarget: toNumber(rules.profitTarget),
      maxSinglePositionNotional: toNumber(rules.maxSinglePositionNotional),
      leverageLimit: toNumber(rules.leverageLimit),
      minTradingDays: rules.minTradingDays ?? undefined,
    };
  }

  async getEvaluationStatus(evaluationId: string, dbClient?: DbClient) {
    const evaluation = await evaluationRepository.findByIdOrThrow(evaluationId, dbClient);
    const rules = await evaluationRuleRepository.findByIdOrThrow(
      evaluation.rulesetId,
      dbClient
    );
    const metrics = await this.calculateMetrics(evaluationId, dbClient);
    const violations = await ruleViolationRepository.findByEvaluationId(
      evaluationId,
      dbClient
    );

    return {
      evaluation,
      rules,
      metrics,
      violations,
    };
  }

  async freezeAccount(evaluationId: string, dbClient?: DbClient): Promise<void> {
    await evaluationRepository.updateStatus(evaluationId, 'FROZEN', dbClient);
    logger.info('Evaluation account frozen', { evaluationId });
  }

  async unfreezeAccount(evaluationId: string, dbClient?: DbClient): Promise<void> {
    await evaluationRepository.updateStatus(evaluationId, 'ACTIVE', dbClient);
    logger.info('Evaluation account unfrozen', { evaluationId });
  }
}

export const evaluationEngine = new EvaluationEngine();
