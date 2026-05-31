import { BarInterval, MarketBar, MarketPrice } from '../domain/types.js';
import { SYMBOL_CONFIG, SYMBOLS } from '../shared/constants.js';
import { invalidInput } from '../shared/errors.js';

export class MockMarketProvider {
  private readonly ticks = new Map<string, number>();
  private readonly priceOverrides = new Map<string, number>();

  constructor() {
    this.reset();
  }

  listSymbols(): string[] {
    return [...SYMBOLS];
  }

  getLastPrice(symbol: string): MarketPrice {
    const normalized = this.normalizeSymbol(symbol);
    const override = this.priceOverrides.get(normalized);
    const price = override ?? this.nextDeterministicPrice(normalized);

    return {
      symbol: normalized,
      price,
      ts: new Date().toISOString(),
      source: 'MOCK',
    };
  }

  peekLastPrice(symbol: string): number {
    const normalized = this.normalizeSymbol(symbol);
    const override = this.priceOverrides.get(normalized);
    if (override !== undefined) {
      return override;
    }

    const tick = this.ticks.get(normalized) ?? 0;
    return this.calculatePrice(normalized, Math.max(0, tick - 1));
  }

  getBars(symbol: string, interval: BarInterval, limit: number): MarketBar[] {
    const normalized = this.normalizeSymbol(symbol);
    const boundedLimit = Math.max(1, Math.min(limit, 1000));
    const stepMs = interval === '1m' ? 60_000 : 86_400_000;
    const end = Date.UTC(2024, 0, 2, 21, 0, 0);
    const base = this.basePrice(normalized);

    const bars: MarketBar[] = [];
    for (let i = boundedLimit - 1; i >= 0; i -= 1) {
      const n = boundedLimit - 1 - i;
      const open = this.calculatePrice(normalized, n);
      const close = this.round(open + base * 0.0005);
      const high = this.round(Math.max(open, close) + base * 0.001);
      const low = this.round(Math.min(open, close) - base * 0.001);

      bars.push({
        symbol: normalized,
        startTs: new Date(end - i * stepMs).toISOString(),
        open,
        high,
        low,
        close,
        volume: 1000 + n * 10,
      });
    }

    return bars;
  }

  setTestPrice(symbol: string, price: number): void {
    if (price <= 0) {
      throw invalidInput('Test price must be positive.');
    }
    this.priceOverrides.set(this.normalizeSymbol(symbol), this.round(price));
  }

  clearTestPrice(symbol: string): void {
    this.priceOverrides.delete(this.normalizeSymbol(symbol));
  }

  reset(): void {
    this.ticks.clear();
    this.priceOverrides.clear();
    for (const symbol of SYMBOLS) {
      this.ticks.set(symbol, 0);
    }
  }

  normalizeSymbol(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (!SYMBOLS.includes(normalized)) {
      throw invalidInput(`Invalid symbol: ${symbol}. Supported symbols: ${SYMBOLS.join(', ')}`);
    }
    return normalized;
  }

  private nextDeterministicPrice(symbol: string): number {
    const tick = this.ticks.get(symbol) ?? 0;
    this.ticks.set(symbol, tick + 1);
    return this.calculatePrice(symbol, tick);
  }

  private calculatePrice(symbol: string, step: number): number {
    const base = this.basePrice(symbol);
    const phase = (step % 20) - 10;
    return this.round(base + (phase / 10) * base * 0.002);
  }

  private basePrice(symbol: string): number {
    return SYMBOL_CONFIG[symbol as keyof typeof SYMBOL_CONFIG]?.base ?? 100;
  }

  private round(value: number): number {
    return Number(value.toFixed(6));
  }
}
