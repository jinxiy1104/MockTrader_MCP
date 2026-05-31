export class SandboxError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

export const invalidInput = (message: string) => new SandboxError(message, 'INVALID_INPUT');
export const notFound = (message: string) => new SandboxError(message, 'NOT_FOUND');
export const conflict = (message: string) => new SandboxError(message, 'CONFLICT');
export const insufficientFunds = (message: string) => new SandboxError(message, 'INSUFFICIENT_FUNDS');
export const evaluationClosed = (message: string) => new SandboxError(message, 'EVALUATION_CLOSED');
