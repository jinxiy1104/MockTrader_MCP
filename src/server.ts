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
    'create_replay_evaluation',
    'Create a time-stepped replay evaluation where future market bars are hidden until advance_time is called.',
    {
      challengeName: z.string().min(1).max(100).optional().describe('Optional replay evaluation name.'),
      initialBalance: z
        .number()
        .positive()
        .default(DEFAULT_INITIAL_BALANCE)
        .describe('Starting cash balance.'),
      rules: RulesInputSchema.optional().describe('Optional rule overrides.'),
      symbols: z
        .array(z.string().min(1))
        .min(1)
        .max(20)
        .optional()
        .describe('Symbols included in the replay. Defaults to all mock symbols.'),
      interval: z.enum(SUPPORTED_INTERVALS).default('1d').describe('Replay bar interval.'),
      lookbackBars: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(5)
        .describe('Historical bars visible before the first trading step.'),
      tradingSteps: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(5)
        .describe('Number of hidden future bars to reveal one step at a time.'),
      strictMarketData: z
        .boolean()
        .default(true)
        .describe('When true, blocks normal get_price/get_bars while this replay has hidden future bars.'),
    },
    async (input) => jsonResponse(sandbox.createReplayEvaluation(input)),
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
    'get_visible_bars',
    'Get only the replay bars visible at the current replay time. Future bars remain hidden.',
    {
      evaluationId: z.string().min(1).describe('Replay evaluation ID returned by create_replay_evaluation.'),
      symbol: z.string().min(1).optional().describe('Optional symbol filter.'),
      limit: z.number().int().min(1).max(1000).optional().describe('Optional max visible bars per symbol.'),
    },
    async ({ evaluationId, symbol, limit }) => jsonResponse(sandbox.getVisibleBars(evaluationId, symbol, limit)),
  );

  server.tool(
    'advance_time',
    'Advance a replay evaluation by one or more bars, revealing the next hidden market data step.',
    {
      evaluationId: z.string().min(1).describe('Replay evaluation ID returned by create_replay_evaluation.'),
      steps: z.number().int().min(1).max(1000).default(1).describe('Number of replay steps to advance.'),
    },
    async ({ evaluationId, steps }) => jsonResponse(sandbox.advanceTime({ evaluationId, steps })),
  );

  server.tool(
    'get_replay_status',
    'Get replay clock state, hidden-bars count, and linked evaluation status.',
    {
      evaluationId: z.string().min(1).describe('Replay evaluation ID returned by create_replay_evaluation.'),
    },
    async ({ evaluationId }) => jsonResponse(sandbox.getReplayStatus(evaluationId)),
  );

  server.tool(
    'get_pnl_report',
    'Get a structured PnL report with equity, realized/unrealized PnL, trades, positions, and violations.',
    {
      evaluationId: z.string().min(1).describe('Evaluation ID returned by create_evaluation or create_replay_evaluation.'),
    },
    async ({ evaluationId }) => jsonResponse(sandbox.getPnlReport(evaluationId)),
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
