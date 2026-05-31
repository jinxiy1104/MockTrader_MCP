import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SandboxService } from './sandbox/sandbox-service.js';
import { DEFAULT_INITIAL_BALANCE, SUPPORTED_INTERVALS } from './shared/constants.js';
import { OrderSideSchema, RulesInputSchema } from './tools/schemas.js';

const jsonResponse = (data: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(data, null, 2),
    },
  ],
});

export function createMockTradeMcpServer(sandbox = new SandboxService()): McpServer {
  const server = new McpServer({
    name: 'mocktrade-mcp',
    version: '0.1.0',
  });

  server.tool(
    'list_symbols',
    'List deterministic mock-market symbols available for simulated trading.',
    {},
    async () => jsonResponse(sandbox.listSymbols()),
  );

  server.tool(
    'get_price',
    'Get the latest deterministic mock price for a symbol.',
    {
      symbol: z.string().min(1).describe('Trading symbol, for example AAPL.'),
    },
    async ({ symbol }) => jsonResponse(sandbox.getPrice(symbol)),
  );

  server.tool(
    'get_bars',
    'Get deterministic OHLCV bars for a symbol.',
    {
      symbol: z.string().min(1).describe('Trading symbol, for example AAPL.'),
      interval: z.enum(SUPPORTED_INTERVALS).default('1d').describe('Bar interval.'),
      limit: z.number().int().min(1).max(1000).default(30).describe('Number of bars to return.'),
    },
    async ({ symbol, interval, limit }) => jsonResponse(sandbox.getBars(symbol, interval, limit)),
  );

  server.tool(
    'create_evaluation',
    'Create a fresh in-memory trading evaluation account.',
    {
      challengeName: z.string().min(1).max(100).optional().describe('Optional evaluation name.'),
      initialBalance: z
        .number()
        .positive()
        .default(DEFAULT_INITIAL_BALANCE)
        .describe('Starting cash balance.'),
      rules: RulesInputSchema.optional().describe('Optional rule overrides.'),
    },
    async ({ challengeName, initialBalance, rules }) =>
      jsonResponse(sandbox.createEvaluation({ challengeName, initialBalance, rules })),
  );

  server.tool(
    'place_order',
    'Place a simulated market order in an active evaluation.',
    {
      evaluationId: z.string().min(1).describe('Evaluation ID returned by create_evaluation.'),
      symbol: z.string().min(1).describe('Trading symbol, for example AAPL.'),
      side: OrderSideSchema.describe('BUY or SELL.'),
      quantity: z.number().positive().describe('Share quantity.'),
      clientOrderId: z.string().min(1).max(128).optional().describe('Optional idempotency key.'),
    },
    async (order) => jsonResponse(sandbox.placeOrder(order)),
  );

  server.tool(
    'get_evaluation_status',
    'Get account status, metrics, rules, and latest rule result for an evaluation.',
    {
      evaluationId: z.string().min(1).describe('Evaluation ID returned by create_evaluation.'),
    },
    async ({ evaluationId }) => jsonResponse(sandbox.getEvaluationStatus(evaluationId)),
  );

  server.tool(
    'get_positions',
    'List open positions for an evaluation with current mark-to-market values.',
    {
      evaluationId: z.string().min(1).describe('Evaluation ID returned by create_evaluation.'),
    },
    async ({ evaluationId }) => jsonResponse(sandbox.getPositions(evaluationId)),
  );

  server.tool(
    'get_trade_history',
    'List simulated trades for an evaluation, newest first.',
    {
      evaluationId: z.string().min(1).describe('Evaluation ID returned by create_evaluation.'),
      limit: z.number().int().min(1).max(1000).default(100).describe('Maximum trades to return.'),
    },
    async ({ evaluationId, limit }) => jsonResponse(sandbox.getTradeHistory(evaluationId, limit)),
  );

  server.tool(
    'get_violations',
    'List rule violations recorded for an evaluation.',
    {
      evaluationId: z.string().min(1).describe('Evaluation ID returned by create_evaluation.'),
    },
    async ({ evaluationId }) => jsonResponse(sandbox.getViolations(evaluationId)),
  );

  server.tool(
    'reset_sandbox',
    'Clear all in-memory evaluations, trades, positions, violations, and mock-market ticks.',
    {},
    async () => jsonResponse(sandbox.resetSandbox()),
  );

  return server;
}
