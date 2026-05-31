import { Evaluation, Trade, Violation } from '../domain/types.js';

export class InMemoryStore {
  readonly evaluations = new Map<string, Evaluation>();
  readonly trades = new Map<string, Trade[]>();
  readonly violations = new Map<string, Violation[]>();
  readonly clientOrderIds = new Map<string, Trade>();

  reset(): void {
    this.evaluations.clear();
    this.trades.clear();
    this.violations.clear();
    this.clientOrderIds.clear();
  }

  getTrades(evaluationId: string): Trade[] {
    return this.trades.get(evaluationId) ?? [];
  }

  setTrades(evaluationId: string, trades: Trade[]): void {
    this.trades.set(evaluationId, trades);
  }

  addViolation(violation: Violation): void {
    const existing = this.violations.get(violation.evaluationId) ?? [];
    const duplicate = existing.some(
      (item) => item.ruleType === violation.ruleType && item.threshold === violation.threshold,
    );
    if (!duplicate) {
      this.violations.set(violation.evaluationId, [...existing, violation]);
    }
  }
}
