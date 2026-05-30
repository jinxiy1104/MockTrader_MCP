import { APP_CONSTANTS } from '@config/constants';
import { tradeRepository } from '@repos/trade.repository';
import { positionRepository } from '@repos/position.repository';
import { evaluationRepository } from '@repos/evaluation.repository';
import { evaluationRuleRepository } from '@repos/evaluationrule.repository';
import {
  ConflictError,
  InsufficientFundsError,
  InvalidOrderError,
  EvaluationFrozenError,
} from '@utils/errors';
import { logger } from '@utils/logger';
import { Prisma, PrismaClient, TradeSide } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Simulated Trading Engine
 * Handles order execution, fills, and position updates
 *
 * IMPORTANT: This is a SIMULATION. No real broker connection.
 */

export interface OrderRequest {
  evaluationId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  clientOrderId?: string;
  currentPrice: number; // From market data service
}

export interface OrderResult {
  tradeId: bigint;
  evaluationId: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  executedPrice: number;
  fee: number;
  executedAt: Date;
  newBalance: number;
  newEquity: number;
}

export class TradingEngine {
  private async calculateAccountEquity(
    evaluationId: string,
    currentBalance: number,
    dbClient?: DbClient
  ): Promise<number> {
    const positions = await positionRepository.findByEvaluationId(evaluationId, dbClient);

    const openPositionsMarketValue = positions.reduce((sum, position) => {
      const quantity = parseFloat(position.quantity.toString());
      const avgPrice = parseFloat(position.avgPrice.toString());
      const unrealizedPnl = parseFloat(position.unrealizedPnl.toString());
      return sum + quantity * avgPrice + unrealizedPnl;
    }, 0);

    return currentBalance + openPositionsMarketValue;
  }

  /**
   * Execute a market order (instant fill at current price)
   */
  async executeMarketOrder(
    order: OrderRequest,
    dbClient?: DbClient
  ): Promise<OrderResult> {
    logger.info('Executing market order', { order });

    // 1. Validate evaluation account is active
    const evaluation = await evaluationRepository.findByIdOrThrow(
      order.evaluationId,
      dbClient
    );
    if (evaluation.status !== 'ACTIVE') {
      throw new EvaluationFrozenError(
        `Cannot trade on ${evaluation.status} evaluation`
      );
    }

    // 2. Validate order parameters
    this.validateOrder(order);

    // 2.5 SELL guard: shorting is not allowed in MVP.
    if (order.side === 'SELL') {
      await this.assertSellQuantityAllowed(
        order.evaluationId,
        order.symbol,
        order.quantity,
        dbClient
      );
    } else {
      await this.assertBuyWithinSinglePositionLimit(
        evaluation,
        order.symbol,
        order.quantity,
        order.currentPrice,
        dbClient
      );
    }

    // 3. Calculate execution details with slippage
    const { executedPrice, fee } = this.calculateExecution(
      order.currentPrice,
      order.quantity,
      order.side
    );

    // 4. Calculate order value
    const orderValue = order.quantity * executedPrice;
    const totalCost = order.side === 'BUY' ? orderValue + fee : -(orderValue - fee);

    // 5. Check sufficient funds
    const newBalance = parseFloat(evaluation.currentBalance.toString()) - totalCost;
    if (newBalance < 0) {
      throw new InsufficientFundsError(
        `Insufficient funds: order requires $${totalCost.toFixed(2)}, available: $${evaluation.currentBalance}`
      );
    }

    // 6. Record trade in ledger (source of truth)
    const trade = await tradeRepository.create(
      {
        evaluationId: order.evaluationId,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: executedPrice,
        fee,
        source: 'USER',
        clientOrderId: order.clientOrderId,
      },
      dbClient
    );

    // 7. Update position (cache)
    await this.updatePosition(order.evaluationId, order.symbol, dbClient);

    // 8. Calculate new equity as cash balance plus open-position market value.
    const newEquity = await this.calculateAccountEquity(
      order.evaluationId,
      newBalance,
      dbClient
    );
    const currentPeakEquity = parseFloat((evaluation as any).peakEquity.toString());
    const newPeakEquity = Math.max(currentPeakEquity, newEquity);

    // 9. Update evaluation account
    await evaluationRepository.update(
      order.evaluationId,
      {
        currentBalance: newBalance,
        equity: newEquity,
        peakEquity: newPeakEquity,
      },
      dbClient
    );

    logger.info('Order executed successfully', {
      tradeId: trade.id,
      newBalance,
      newEquity,
    });

    return {
      tradeId: trade.id,
      evaluationId: order.evaluationId,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      executedPrice,
      fee,
      executedAt: trade.executedAt,
      newBalance,
      newEquity,
    };
  }

  /**
   * Validate order parameters
   */
  private validateOrder(order: OrderRequest): void {
    if (order.quantity < APP_CONSTANTS.TRADING.MIN_ORDER_QUANTITY) {
      throw new InvalidOrderError(
        `Quantity too small: minimum is ${APP_CONSTANTS.TRADING.MIN_ORDER_QUANTITY}`
      );
    }

    if (order.quantity > APP_CONSTANTS.TRADING.MAX_ORDER_QUANTITY) {
      throw new InvalidOrderError(
        `Quantity too large: maximum is ${APP_CONSTANTS.TRADING.MAX_ORDER_QUANTITY}`
      );
    }

    if (order.currentPrice <= 0) {
      throw new InvalidOrderError('Invalid price');
    }
  }

  private async assertSellQuantityAllowed(
    evaluationId: string,
    symbol: string,
    requestedQuantity: number,
    dbClient?: DbClient
  ): Promise<void> {
    const position = await positionRepository.findByEvaluationAndSymbol(
      evaluationId,
      symbol,
      dbClient
    );

    const currentQuantity = position
      ? parseFloat(position.quantity.toString())
      : 0;

    if (requestedQuantity > currentQuantity) {
      throw new ConflictError(
        `Cannot sell ${requestedQuantity}. Available quantity: ${currentQuantity}. Shorting is not allowed.`
      );
    }
  }

  private async assertBuyWithinSinglePositionLimit(
    evaluation: { id: string; rulesetId: string; initialBalance: Prisma.Decimal },
    symbol: string,
    requestedQuantity: number,
    currentPrice: number,
    dbClient?: DbClient
  ): Promise<void> {
    const ruleset = await evaluationRuleRepository.findByIdOrThrow(
      evaluation.rulesetId,
      dbClient
    );
    const maxSinglePositionNotional = (ruleset as any).maxSinglePositionNotional;

    if (!maxSinglePositionNotional) {
      return;
    }

    const initialBalance = parseFloat(evaluation.initialBalance.toString());
    if (initialBalance <= 0) {
      return;
    }

    const maxPositionRatio =
      parseFloat(maxSinglePositionNotional.toString()) / initialBalance;
    const maxSinglePositionNotionalLimit = initialBalance * maxPositionRatio;

    const existingPosition = await positionRepository.findByEvaluationAndSymbol(
      evaluation.id,
      symbol,
      dbClient
    );
    const existingQuantity = existingPosition
      ? parseFloat(existingPosition.quantity.toString())
      : 0;

    const resultingPositionNotional =
      (existingQuantity + requestedQuantity) * currentPrice;

    if (resultingPositionNotional > maxSinglePositionNotionalLimit) {
      throw new InvalidOrderError(
        `Cannot trade above max single-position notional (${maxSinglePositionNotionalLimit.toFixed(2)})`
      );
    }
  }

  /**
   * Calculate execution price with simulated slippage and fees
   */
  private calculateExecution(
    marketPrice: number,
    quantity: number,
    side: TradeSide
  ): { executedPrice: number; fee: number } {
    // Apply slippage (worse price for trader)
    const slippageAmount = marketPrice * APP_CONSTANTS.TRADING.SIMULATED_SLIPPAGE;
    const executedPrice =
      side === 'BUY'
        ? marketPrice + slippageAmount
        : marketPrice - slippageAmount;

    // Calculate fee
    const orderValue = quantity * executedPrice;
    const fee = orderValue * APP_CONSTANTS.TRADING.SIMULATED_FEE_RATE;

    return {
      executedPrice: parseFloat(executedPrice.toFixed(6)),
      fee: parseFloat(fee.toFixed(6)),
    };
  }

  /**
   * Update position cache from trade ledger
   */
  private async updatePosition(
    evaluationId: string,
    symbol: string,
    dbClient?: DbClient
  ): Promise<void> {
    // Rebuild position from trade ledger
    const trades = await tradeRepository.findByEvaluationAndSymbol(
      evaluationId,
      symbol,
      dbClient
    );

    let quantity = 0;
    let totalCost = 0;
    let realizedPnl = 0;

    for (const trade of trades) {
      const tradeQuantity = parseFloat(trade.quantity.toString());
      const tradePrice = parseFloat(trade.price.toString());
      const tradeFee = parseFloat(trade.fee.toString());

      if (trade.side === 'BUY') {
        totalCost += tradeQuantity * tradePrice;
        quantity += tradeQuantity;
        realizedPnl -= tradeFee;
      } else {
        // SELL
        if (quantity > 0) {
          const sellQuantity = Math.min(tradeQuantity, quantity);
          const avgPrice = quantity > 0 ? totalCost / quantity : 0;
          const pnl = sellQuantity * (tradePrice - avgPrice);
          realizedPnl += pnl - tradeFee;
          quantity -= sellQuantity;
          totalCost -= sellQuantity * avgPrice;
        }
      }
    }

    const avgPrice = quantity > 0 ? totalCost / quantity : 0;

    // If position is closed, delete it
    if (quantity === 0) {
      await positionRepository.deleteIfClosed(evaluationId, symbol, dbClient);
      return;
    }

    // Otherwise, upsert position
    await positionRepository.upsert(
      {
        evaluationId,
        symbol,
        quantity,
        avgPrice,
        unrealizedPnl: 0, // Will be updated by mark-to-market
        realizedPnl,
      },
      dbClient
    );
  }

  /**
   * Mark-to-market: Update unrealized PnL for all positions
   * This should be called periodically with current prices
   */
  async markToMarket(
    evaluationId: string,
    currentPrices: Map<string, number>,
    dbClient?: DbClient
  ): Promise<void> {
    const positions = await positionRepository.findByEvaluationId(evaluationId, dbClient);
    const evaluation = await evaluationRepository.findByIdOrThrow(evaluationId, dbClient);

    if (positions.length === 0) {
      const currentBalance = parseFloat(evaluation.currentBalance.toString());
      const currentEquity = parseFloat(evaluation.equity.toString());
      const currentPeakEquity = parseFloat((evaluation as any).peakEquity.toString());
      const newPeakEquity = Math.max(currentPeakEquity, currentBalance);

      if (currentEquity !== currentBalance || newPeakEquity !== currentPeakEquity) {
        await evaluationRepository.update(
          evaluationId,
          {
            equity: currentBalance,
            peakEquity: newPeakEquity,
          },
          dbClient
        );
      }
      return;
    }

    let totalUnrealizedPnL = 0;
    let totalOpenPositionsMarketValue = 0;
    const updates: Promise<unknown>[] = [];
    let requiresDbAggregate = false;

    for (const position of positions) {
      const quantity = parseFloat(position.quantity.toString());
      const avgPrice = parseFloat(position.avgPrice.toString());
      const currentPrice = currentPrices.get(position.symbol);

      if (currentPrice === undefined) {
        if (position.unrealizedPnl) {
          const persistedUnrealizedPnl = parseFloat(position.unrealizedPnl.toString());
          totalUnrealizedPnL += persistedUnrealizedPnl;
          totalOpenPositionsMarketValue += quantity * avgPrice + persistedUnrealizedPnl;
        } else {
          requiresDbAggregate = true;
        }
        continue;
      }

      const unrealizedPnl = quantity * (currentPrice - avgPrice);
      totalUnrealizedPnL += unrealizedPnl;
      totalOpenPositionsMarketValue += quantity * currentPrice;
      updates.push(
        positionRepository.updateUnrealizedPnL(
          evaluationId,
          position.symbol,
          unrealizedPnl,
          dbClient
        )
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    if (requiresDbAggregate) {
      totalUnrealizedPnL = await positionRepository.getTotalUnrealizedPnL(
        evaluationId,
        dbClient
      );
      totalOpenPositionsMarketValue = positions.reduce((sum, position) => {
        const quantity = parseFloat(position.quantity.toString());
        const avgPrice = parseFloat(position.avgPrice.toString());
        const unrealizedPnl = parseFloat(position.unrealizedPnl.toString());
        return sum + quantity * avgPrice + unrealizedPnl;
      }, 0);
    }

    // Update evaluation equity
    const newEquity =
      parseFloat(evaluation.currentBalance.toString()) + totalOpenPositionsMarketValue;
    const currentPeakEquity = parseFloat((evaluation as any).peakEquity.toString());
    const newPeakEquity = Math.max(currentPeakEquity, newEquity);

    const currentEquity = evaluation.equity
      ? parseFloat(evaluation.equity.toString())
      : parseFloat(evaluation.currentBalance.toString());
    if (newEquity !== currentEquity || newPeakEquity !== currentPeakEquity) {
      await evaluationRepository.update(
        evaluationId,
        {
          equity: newEquity,
          peakEquity: newPeakEquity,
        },
        dbClient
      );
    }
  }
}

export const tradingEngine = new TradingEngine();
