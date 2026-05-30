import { validationResult } from 'express-validator';
import {
  registerValidation,
  loginValidation,
  placeOrderValidation,
  createEvaluationValidation,
  createRulesetValidation,
  uuidParamValidation,
  symbolParamValidation,
} from '../../../src/rules/validators';

const runValidation = async (
  validations: ReturnType<typeof uuidParamValidation>,
  req: { body?: Record<string, unknown>; params?: Record<string, string> }
) => {
  await Promise.all(validations.map((validation) => validation.run(req)));
  return validationResult(req);
};

describe('validators', () => {
  describe('registerValidation', () => {
    it('rejects invalid email and short password', async () => {
      const result = await runValidation(registerValidation, {
        body: { email: 'not-an-email', password: '123' },
      });

      const messages = result.array().map((err) => err.msg);
      expect(messages).toContain('Must be a valid email');
      expect(messages).toContain('Password must be at least 6 characters long');
    });

    it('accepts a valid email and password', async () => {
      const result = await runValidation(registerValidation, {
        body: { email: 'user@example.com', password: 'secret123' },
      });

      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('loginValidation', () => {
    it('requires email and password', async () => {
      const result = await runValidation(loginValidation, {
        body: { email: 'bad-email', password: '' },
      });

      const messages = result.array().map((err) => err.msg);
      expect(messages).toContain('Must be a valid email');
      expect(messages).toContain('Password is required');
    });

    it('accepts valid credentials', async () => {
      const result = await runValidation(loginValidation, {
        body: { email: 'user@example.com', password: 'password' },
      });

      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('placeOrderValidation', () => {
    it('rejects invalid order fields', async () => {
      const result = await runValidation(placeOrderValidation, {
        body: {
          evaluationId: 'not-a-uuid',
          symbol: 'INVALID',
          side: 'HOLD',
          quantity: 0,
        },
      });

      const messages = result.array().map((err) => err.msg);
      expect(messages).toContain('Invalid evaluation ID');
      expect(messages).toContain('Invalid trading symbol');
      expect(messages).toContain('Side must be either BUY or SELL');
      expect(messages).toContain('Quantity must be greater than 0.001');
    });

    it('accepts valid order data', async () => {
      const result = await runValidation(placeOrderValidation, {
        body: {
          evaluationId: '550e8400-e29b-41d4-a716-446655440000',
          symbol: 'aapl',
          side: 'BUY',
          quantity: 1,
        },
      });

      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('createEvaluationValidation', () => {
    it('rejects invalid fields and long challenge name', async () => {
      const result = await runValidation(createEvaluationValidation, {
        body: {
          userId: 'invalid',
          challengeName: 'a'.repeat(101),
          rulesetId: 'invalid',
          initialBalance: 500,
        },
      });

      const messages = result.array().map((err) => err.msg);
      expect(messages).toContain('Invalid user ID');
      expect(messages).toContain('Challenge name must be less than 100 characters');
      expect(messages).toContain('Invalid ruleset ID');
      expect(messages).toContain('Initial balance must be at least 1000');
    });

    it('accepts valid required fields without initial balance', async () => {
      const result = await runValidation(createEvaluationValidation, {
        body: {
          userId: '550e8400-e29b-41d4-a716-446655440000',
          challengeName: 'Starter',
          rulesetId: '550e8400-e29b-41d4-a716-446655440001',
        },
      });

      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('createRulesetValidation', () => {
    it('rejects negative rule values', async () => {
      const result = await runValidation(createRulesetValidation, {
        body: {
          name: '',
          maxDrawdown: -1,
          dailyLossLimit: -1,
          profitTarget: -1,
          maxSinglePositionNotional: -1,
          leverageLimit: 0,
          minTradingDays: -1,
        },
      });

      const messages = result.array().map((err) => err.msg);
      expect(messages).toContain('Ruleset name is required');
      expect(messages).toContain('Max drawdown must be positive');
      expect(messages).toContain('Daily loss limit must be positive');
      expect(messages).toContain('Profit target must be positive');
      expect(messages).toContain('Max single-position notional must be positive');
      expect(messages).toContain('Leverage limit must be at least 1');
      expect(messages).toContain('Min trading days must be a positive integer');
    });

    it('accepts only required name', async () => {
      const result = await runValidation(createRulesetValidation, {
        body: { name: 'Standard' },
      });

      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('uuidParamValidation', () => {
    it('rejects invalid uuid param', async () => {
      const result = await runValidation(uuidParamValidation('id'), {
        params: { id: 'not-a-uuid' },
      });

      const messages = result.array().map((err) => err.msg);
      expect(messages).toContain('Invalid id');
    });
  });

  describe('symbolParamValidation', () => {
    it('rejects invalid symbol param', async () => {
      const result = await runValidation(symbolParamValidation, {
        params: { symbol: 'bad-symbol' },
      });

      const messages = result.array().map((err) => err.msg);
      expect(messages).toContain('Invalid trading symbol');
    });

    it('accepts valid symbol param', async () => {
      const result = await runValidation(symbolParamValidation, {
        params: { symbol: 'TSLA' },
      });

      expect(result.isEmpty()).toBe(true);
    });
  });
});
