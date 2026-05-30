/**
 * Custom error classes for the application
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad Request') {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 422);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500);
  }
}

// Trading-specific errors
export class TradingError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class InsufficientFundsError extends TradingError {
  constructor(message: string = 'Insufficient funds for this trade') {
    super(message);
  }
}

export class InvalidOrderError extends TradingError {
  constructor(message: string = 'Invalid order parameters') {
    super(message);
  }
}

export class EvaluationFrozenError extends TradingError {
  constructor(message: string = 'Evaluation account is frozen or inactive') {
    super(message);
  }
}

// Evaluation-specific errors
export class RuleViolationError extends AppError {
  constructor(message: string) {
    super(message, 403);
  }
}

// Market data errors
export class MarketDataProviderError extends AppError {
  constructor(message: string = 'Market data provider error', statusCode: number = 502) {
    super(message, statusCode);
  }
}

export class MarketDataUnavailableError extends AppError {
  constructor(message: string = 'Market data temporarily unavailable') {
    super(message, 503);
  }
}
