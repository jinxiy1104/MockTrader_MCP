import { MarketBarDTO, MarketPriceDTO } from '@app-types/dtos';
import { createMarketProviderFromEnv } from './market/market.factory';
import { BarInterval, BarQueryOptions, MarketDataProvider } from './market/market.provider';
import { MockMarketDataProvider } from './market/mock.provider';

/**
 * Market Data Service
 * Delegates market data access to the configured provider.
 */
export class MarketDataService {
  constructor(private readonly provider: MarketDataProvider = createMarketProviderFromEnv()) {}

  async getPrice(symbol: string): Promise<MarketPriceDTO> {
    const price = await this.provider.getLastPrice(symbol);
    return {
      symbol: price.symbol,
      price: price.price,
      timestamp: price.ts,
      source: price.source as MarketPriceDTO['source'],
    };
  }

  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const normalizedSymbols = Array.from(
      new Set(symbols.map((symbol) => symbol.toUpperCase()))
    );

    const entries = await Promise.all(
      normalizedSymbols.map(async (symbol) => {
        const priceData = await this.getPrice(symbol);
        return [symbol, priceData.price] as const;
      })
    );

    return new Map(entries);
  }

  async getBars(
    symbol: string,
    interval: BarInterval,
    limit: number,
    options?: BarQueryOptions
  ): Promise<MarketBarDTO[]> {
    const bars = await this.provider.getBars(symbol, interval, limit, options);
    return bars.map((bar) => ({
      symbol: bar.symbol,
      startTs: bar.startTs,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
  }

  setTestPrice(symbol: string, price: number): void {
    if (this.provider instanceof MockMarketDataProvider) {
      this.provider.setTestPrice(symbol, price);
    }
  }

  clearTestPrice(symbol: string): void {
    if (this.provider instanceof MockMarketDataProvider) {
      this.provider.clearTestPrice(symbol);
    }
  }
}

export const marketDataService = new MarketDataService();
