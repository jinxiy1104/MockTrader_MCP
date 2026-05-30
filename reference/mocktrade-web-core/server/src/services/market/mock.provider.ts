import { APP_CONSTANTS, isValidSymbol } from '@config/constants';
import { InvalidOrderError } from '@utils/errors';
import { Bar, BarInterval, BarQueryOptions, MarketDataProvider, Price } from './market.provider';

interface MockProviderOptions {
  deterministic?: boolean;
}

/**
 * Mock market data provider for local dev/tests.
 * Deterministic mode avoids random-walk drift in tests.
 */
export class MockMarketDataProvider implements MarketDataProvider {
  private readonly deterministic: boolean;
  private readonly symbolTicks: Map<string, number> = new Map();
  private readonly priceCache: Map<string, number> = new Map();
  private readonly testPriceOverrides: Map<string, number> = new Map();

  constructor(options?: MockProviderOptions) {
    this.deterministic = options?.deterministic ?? false;
    this.initializePrices();
  }

  async getLastPrice(symbol: string): Promise<Price> {
    if (!isValidSymbol(symbol)) {
      throw new InvalidOrderError(`Invalid symbol: ${symbol}`);
    }

    const symbolUpper = symbol.toUpperCase();
    const forcedPrice = this.testPriceOverrides.get(symbolUpper);
    if (forcedPrice !== undefined) {
      return {
        symbol: symbolUpper,
        ts: new Date(),
        price: forcedPrice,
        source: 'MOCK',
      };
    }

    const nextPrice = this.deterministic
      ? this.generateDeterministicPrice(symbolUpper)
      : this.generateRandomWalkPrice(symbolUpper);

    this.priceCache.set(symbolUpper, nextPrice);
    return {
      symbol: symbolUpper,
      ts: new Date(),
      price: nextPrice,
      source: 'MOCK',
    };
  }

  async getBars(
    symbol: string,
    interval: BarInterval,
    limit: number,
    options?: BarQueryOptions
  ): Promise<Bar[]> {
    if (!isValidSymbol(symbol)) {
      throw new InvalidOrderError(`Invalid symbol: ${symbol}`);
    }

    const symbolUpper = symbol.toUpperCase();
    const boundedLimit = Math.max(1, Math.min(limit, 1000));
    const now = options?.end?.getTime() ?? Date.now();
    const stepMs = interval === '1m' ? 60_000 : 86_400_000;
    const base = this.getBasePrice(symbolUpper);

    const bars: Bar[] = [];
    for (let i = boundedLimit - 1; i >= 0; i--) {
      const ts = new Date(now - i * stepMs);
      const n = boundedLimit - 1 - i;
      const drift = this.deterministic
        ? this.deterministicDelta(symbolUpper, n)
        : (Math.random() - 0.5) * base * 0.01;
      const open = base + drift;
      const close = open + (this.deterministic ? base * 0.0005 : (Math.random() - 0.5) * base * 0.005);
      const high = Math.max(open, close) + base * 0.001;
      const low = Math.min(open, close) - base * 0.001;

      bars.push({
        symbol: symbolUpper,
        startTs: ts,
        open: this.round(open),
        high: this.round(high),
        low: this.round(low),
        close: this.round(close),
        volume: Math.floor(1000 + n * 10),
      });
    }

    if (!options?.start) {
      return bars;
    }

    return bars.filter((bar) => bar.startTs >= options.start!);
  }

  private initializePrices(): void {
    Object.entries(APP_CONSTANTS.MOCK_PRICES).forEach(([symbol, config]) => {
      this.priceCache.set(symbol, config.base);
      this.symbolTicks.set(symbol, 0);
    });
  }

  private getBasePrice(symbol: string): number {
    const config = APP_CONSTANTS.MOCK_PRICES[symbol as keyof typeof APP_CONSTANTS.MOCK_PRICES];
    return config?.base ?? 100;
  }

  private deterministicDelta(symbol: string, step: number): number {
    const base = this.getBasePrice(symbol);
    // Stable deterministic wave based on step.
    const phase = (step % 20) - 10;
    return (phase / 10) * base * 0.002;
  }

  private generateDeterministicPrice(symbol: string): number {
    const tick = this.symbolTicks.get(symbol) ?? 0;
    this.symbolTicks.set(symbol, tick + 1);
    const base = this.getBasePrice(symbol);
    return this.round(base + this.deterministicDelta(symbol, tick));
  }

  private generateRandomWalkPrice(symbol: string): number {
    const config = APP_CONSTANTS.MOCK_PRICES[symbol as keyof typeof APP_CONSTANTS.MOCK_PRICES];
    const base = config?.base ?? 100;
    const volatility = config?.volatility ?? 0.02;
    const current = this.priceCache.get(symbol) ?? base;
    const change = (Math.random() - 0.5) * 2 * volatility;
    const next = current * (1 + change);
    const clamp = base * 0.2;
    const clamped = Math.max(base - clamp, Math.min(base + clamp, next));
    return this.round(clamped);
  }

  private round(value: number): number {
    return parseFloat(value.toFixed(2));
  }

  setTestPrice(symbol: string, price: number): void {
    this.testPriceOverrides.set(symbol.toUpperCase(), this.round(price));
  }

  clearTestPrice(symbol: string): void {
    this.testPriceOverrides.delete(symbol.toUpperCase());
  }
}
