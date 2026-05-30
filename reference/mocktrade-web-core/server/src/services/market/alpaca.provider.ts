import { BarQueryOptions, MarketDataProvider, Price, Bar, BarInterval } from './market.provider';
import {
  BadRequestError,
  MarketDataProviderError,
  MarketDataUnavailableError,
} from '@utils/errors';

interface AlpacaProviderOptions {
  keyId: string;
  secretKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  retryCount?: number;
  latestFeed?: string;
  barsFeed?: string;
  currency?: string;
}

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class AlpacaMarketDataProvider implements MarketDataProvider {
  private readonly keyId: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly retryCount: number;
  private readonly latestFeed: string;
  private readonly barsFeed: string;
  private readonly currency: string;
  private readonly cache = new Map<string, CacheEntry<Price | Bar[]>>();
  private readonly inflight = new Map<string, Promise<Price | Bar[]>>();

  constructor(options: AlpacaProviderOptions) {
    this.keyId = options.keyId;
    this.secretKey = options.secretKey;
    this.baseUrl = options.baseUrl || 'https://data.alpaca.markets';
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.cacheTtlMs = options.cacheTtlMs ?? 1000;
    this.retryCount = options.retryCount ?? 1;
    this.latestFeed = options.latestFeed ?? 'iex';
    this.barsFeed = options.barsFeed ?? 'iex';
    this.currency = options.currency ?? 'USD';
  }

  async getLastPrice(symbol: string): Promise<Price> {
    const symbolUpper = this.validateSymbol(symbol);
    const key = `last:${symbolUpper}`;
    const cached = this.getCache<Price>(key);
    if (cached) return cached;

    const request = this.dedup<Price>(key, async () => {
      const query = new URLSearchParams({
        symbols: symbolUpper,
        feed: this.latestFeed,
        currency: this.currency,
      });
      const url = `${this.baseUrl}/v2/stocks/trades/latest?${query.toString()}`;
      const response = await this.fetchWithRetry(url);
      const payload: any = await response.json();
      const trade = payload?.trades?.[symbolUpper];

      if (!trade || typeof trade.p !== 'number' || !trade.t) {
        throw new MarketDataProviderError('Invalid latest trade payload from Alpaca');
      }

      const price: Price = {
        symbol: symbolUpper,
        ts: new Date(trade.t),
        price: trade.p,
        source: 'ALPACA',
      };
      this.setCache(key, price);
      return price;
    });

    return request;
  }

  async getBars(
    symbol: string,
    interval: BarInterval,
    limit: number,
    options?: BarQueryOptions
  ): Promise<Bar[]> {
    const symbolUpper = this.validateSymbol(symbol);
    const safeLimit = this.validateLimit(limit);
    const timeframe = interval === '1m' ? '1Min' : '1Day';
    const startKey = options?.start ? options.start.toISOString() : '';
    const endKey = options?.end ? options.end.toISOString() : '';
    const key = `bars:${symbolUpper}:${interval}:${safeLimit}:${startKey}:${endKey}`;
    const cached = this.getCache<Bar[]>(key);
    if (cached) return cached;

    const request = this.dedup<Bar[]>(key, async () => {
      let bars = await this.fetchBarsFromAlpaca(
        symbolUpper,
        timeframe,
        safeLimit,
        options
      );

      // Alpaca may return empty bars for thin windows / market-closed boundaries.
      // Retry once with a bounded lookback window when caller didn't provide start/end.
      if (!options?.start && !options?.end && bars.length === 0) {
        const end = new Date();
        const lookbackDays = interval === '1m' ? 14 : 365;
        const start = new Date(
          end.getTime() - lookbackDays * 24 * 60 * 60 * 1000
        );
        bars = await this.fetchBarsFromAlpaca(
          symbolUpper,
          timeframe,
          safeLimit,
          { start, end },
          true
        );
      }

      this.setCache(key, bars);
      return bars;
    });

    return request;
  }

  private async fetchBarsFromAlpaca(
    symbolUpper: string,
    timeframe: string,
    limit: number,
    options?: BarQueryOptions,
    preferLatest: boolean = false
  ): Promise<Bar[]> {
    const query = new URLSearchParams({
      symbols: symbolUpper,
      timeframe,
      limit: limit.toString(),
      feed: this.barsFeed,
      currency: this.currency,
    });

    if (options?.start) {
      query.set('start', options.start.toISOString());
    }
    if (options?.end) {
      query.set('end', options.end.toISOString());
    }
    if (preferLatest) {
      query.set('sort', 'desc');
    }

    const url = `${this.baseUrl}/v2/stocks/bars?${query.toString()}`;
    const response = await this.fetchWithRetry(url);
    const payload = (await response.json()) as {
      bars?: Record<string, Array<{
        t: string;
        o: number;
        h: number;
        l: number;
        c: number;
        v?: number;
      }>>;
    };
    const barsPayload = Array.isArray(payload?.bars?.[symbolUpper])
      ? payload.bars[symbolUpper]
      : [];

    return barsPayload
      .map((bar) => ({
        symbol: symbolUpper,
        startTs: new Date(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: typeof bar.v === 'number' ? bar.v : undefined,
      }))
      .sort((a, b) => a.startTs.getTime() - b.startTs.getTime());
  }

  private validateSymbol(symbol: string): string {
    const symbolUpper = symbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbolUpper)) {
      throw new BadRequestError(`Invalid symbol: ${symbol}`);
    }
    return symbolUpper;
  }

  private validateLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new BadRequestError('Limit must be between 1 and 1000');
    }
    return limit;
  }

  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private setCache(key: string, value: Price | Bar[]): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private async dedup<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = run()
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise as Promise<Price | Bar[]>);
    return promise;
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.retryCount) {
      try {
        const response = await this.fetchWithTimeout(url);

        if (response.status === 401 || response.status === 403) {
          throw new MarketDataProviderError('Alpaca authentication failed', 502);
        }

        if (response.status === 429) {
          throw new MarketDataUnavailableError('Alpaca rate limit exceeded');
        }

        if (!response.ok) {
          throw new MarketDataProviderError(
            `Alpaca request failed with status ${response.status}`,
            502
          );
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt === this.retryCount) {
          if (error instanceof MarketDataUnavailableError || error instanceof MarketDataProviderError) {
            throw error;
          }
          throw new MarketDataUnavailableError('Market data request timeout or network error');
        }
      }

      attempt += 1;
    }

    throw new MarketDataUnavailableError(
      `Market data request failed: ${String(lastError)}`
    );
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        method: 'GET',
        headers: {
          'APCA-API-KEY-ID': this.keyId,
          'APCA-API-SECRET-KEY': this.secretKey,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
