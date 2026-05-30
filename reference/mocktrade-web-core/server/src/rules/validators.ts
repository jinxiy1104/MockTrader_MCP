import { body, param, ValidationChain } from 'express-validator';
import { isValidSymbol } from '@config/constants';

/**
 * Validation helpers using express-validator
 */

// Auth validations
export const registerValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .withMessage('Must be a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

export const loginValidation: ValidationChain[] = [
  body('email')
    .isEmail()
    .withMessage('Must be a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Trading validations
export const placeOrderValidation: ValidationChain[] = [
  body('evaluationId')
    .isUUID()
    .withMessage('Invalid evaluation ID'),
  body('symbol')
    .notEmpty()
    .withMessage('Symbol is required')
    .custom((value) => {
      if (!isValidSymbol(value)) {
        throw new Error('Invalid trading symbol');
      }
      return true;
    }),
  body('side')
    .isIn(['BUY', 'SELL'])
    .withMessage('Side must be either BUY or SELL'),
  body('quantity')
    .isFloat({ min: 0.001 })
    .withMessage('Quantity must be greater than 0.001'),
];

// Evaluation validations
export const createEvaluationValidation: ValidationChain[] = [
  body('userId')
    .isUUID()
    .withMessage('Invalid user ID'),
  body('challengeName')
    .notEmpty()
    .withMessage('Challenge name is required')
    .isLength({ max: 100 })
    .withMessage('Challenge name must be less than 100 characters'),
  body('rulesetId')
    .isUUID()
    .withMessage('Invalid ruleset ID'),
  body('initialBalance')
    .optional()
    .isFloat({ min: 1000 })
    .withMessage('Initial balance must be at least 1000'),
];

// Ruleset validations
export const createRulesetValidation: ValidationChain[] = [
  body('name')
    .notEmpty()
    .withMessage('Ruleset name is required'),
  body('maxDrawdown')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max drawdown must be positive'),
  body('dailyLossLimit')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Daily loss limit must be positive'),
  body('profitTarget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Profit target must be positive'),
  body('maxSinglePositionNotional')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max single-position notional must be positive'),
  body('leverageLimit')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('Leverage limit must be at least 1'),
  body('minTradingDays')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Min trading days must be a positive integer'),
];

// Param validations
export const uuidParamValidation = (paramName: string): ValidationChain[] => [
  param(paramName)
    .isUUID()
    .withMessage(`Invalid ${paramName}`),
];

export const symbolParamValidation: ValidationChain[] = [
  param('symbol')
    .notEmpty()
    .withMessage('Symbol is required')
    .custom((value) => {
      if (!isValidSymbol(value)) {
        throw new Error('Invalid trading symbol');
      }
      return true;
    }),
];
