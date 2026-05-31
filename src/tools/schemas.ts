import { z } from 'zod';

export const OrderSideSchema = z.enum(['BUY', 'SELL']);

export const RulesInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  maxDrawdown: z.number().positive().optional(),
  dailyLossLimit: z.number().positive().optional(),
  profitTarget: z.number().positive().optional(),
  maxSinglePositionNotional: z.number().positive().optional(),
  leverageLimit: z.number().positive().optional(),
  minTradingDays: z.number().int().min(0).optional(),
});

export type RulesInput = z.infer<typeof RulesInputSchema>;
