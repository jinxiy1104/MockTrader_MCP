import { EvaluationMetrics, RuleType, RuleViolation, Ruleset } from '../domain/types.js';

type Validator = (metrics: EvaluationMetrics, rules: Ruleset) => RuleViolation | null;

const maxDrawdownValidator: Validator = (metrics, rules) => {
  if (rules.maxDrawdown === undefined) {
    return null;
  }
  if (metrics.currentDrawdown > rules.maxDrawdown) {
    return {
      ruleType: RuleType.MAX_DRAWDOWN,
      value: metrics.currentDrawdown,
      threshold: rules.maxDrawdown,
      message: 'Max drawdown exceeded',
    };
  }
  return null;
};

const dailyLossValidator: Validator = (metrics, rules) => {
  if (rules.dailyLossLimit === undefined) {
    return null;
  }
  if (metrics.dailyPnL < -rules.dailyLossLimit) {
    return {
      ruleType: RuleType.DAILY_LOSS_LIMIT,
      value: metrics.dailyPnL,
      threshold: -rules.dailyLossLimit,
      message: 'Daily loss limit exceeded',
    };
  }
  return null;
};

const leverageValidator: Validator = (metrics, rules) => {
  if (rules.leverageLimit === undefined) {
    return null;
  }
  if (metrics.leverage > rules.leverageLimit) {
    return {
      ruleType: RuleType.LEVERAGE_LIMIT,
      value: metrics.leverage,
      threshold: rules.leverageLimit,
      message: 'Leverage limit exceeded',
    };
  }
  return null;
};

export class RuleValidatorRegistry {
  private readonly validators: Validator[] = [
    maxDrawdownValidator,
    dailyLossValidator,
    leverageValidator,
  ];

  validateAll(metrics: EvaluationMetrics, rules: Ruleset): RuleViolation[] {
    return this.validators
      .map((validator) => validator(metrics, rules))
      .filter((violation): violation is RuleViolation => violation !== null);
  }

  checkPassConditions(metrics: EvaluationMetrics, rules: Ruleset): boolean {
    if (rules.profitTarget === undefined) {
      return false;
    }

    const profitMet = metrics.totalPnL >= rules.profitTarget;
    const daysMet = rules.minTradingDays === undefined || metrics.tradingDays >= rules.minTradingDays;
    return profitMet && daysMet;
  }
}

export const ruleValidatorRegistry = new RuleValidatorRegistry();
