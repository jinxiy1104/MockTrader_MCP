import { BarInterval, MarketBar, MarketDataSource } from '../domain/types.js';
import { invalidInput } from '../shared/errors.js';
import { ReplayBarsRequest, ReplayBarsResult, ReplayDataProvider } from './replay-data-provider.js';

export class AlpacaMarketDataProvider implements ReplayDataProvider {
  async loadBars(request: ReplayBarsRequest): Promise<ReplayBarsResult> {
    const apiKeyId = request.alpacaApiKeyId ?? process.env.ALPACA_API_KEY_ID;
    const secretKey = request.alpacaSecretKey ?? process.env.ALPACA_SECRET_KEY;

    if (!apiKeyId || !secretKey) {
      throw invalidInput(
        'Alpaca replay requires alpacaApiKeyId/alpacaSecretKey or ALPACA_API_KEY_ID/ALPACA_SECRET_KEY in the environment.',
      );
    }
    if (!request.start || !request.end) {
      throw invalidInput('Alpaca replay requires start and end timestamps.');
    }

    const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
    url.searchParams.set('symbols', request.symbols.join(','));
    url.searchParams.set('timeframe', toAlpacaTimeframe(request.interval));
    url.searchParams.set('start', request.start);
    url.searchParams.set('end', request.end);
    url.searchParams.set('limit', String(Math.min(10_000, request.totalBars * request.symbols.length)));
    url.searchParams.set('adjustment', 'split');
    url.searchParams.set('feed', 'iex');

    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!response.ok) {
      throw invalidInput(`Alpaca market data request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as AlpacaBarsResponse;
    const barsBySymbol: Record<string, MarketBar[]> = {};
    for (const symbol of request.symbols) {
      barsBySymbol[symbol] = (payload.bars?.[symbol] ?? [])
        .map((bar) => ({
          symbol,
          startTs: new Date(bar.t).toISOString(),
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
        }))
        .sort((a, b) => a.startTs.localeCompare(b.startTs))
        .slice(0, request.totalBars);
      assertEnoughBars('ALPACA', symbol, barsBySymbol[symbol]!, request.totalBars);
    }

    return {
      source: 'ALPACA',
      barsBySymbol,
    };
  }
}

export class PolygonMarketDataProvider implements ReplayDataProvider {
  async loadBars(request: ReplayBarsRequest): Promise<ReplayBarsResult> {
    const apiKey = request.polygonApiKey ?? process.env.POLYGON_API_KEY;
    if (!apiKey) {
      throw invalidInput('Polygon replay requires polygonApiKey or POLYGON_API_KEY in the environment.');
    }
    if (!request.start || !request.end) {
      throw invalidInput('Polygon replay requires start and end timestamps.');
    }

    const barsBySymbol: Record<string, MarketBar[]> = {};
    for (const symbol of request.symbols) {
      const url = new URL(
        `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/${toPolygonTimespan(
          request.interval,
        )}/${encodeURIComponent(toPolygonDate(request.start))}/${encodeURIComponent(toPolygonDate(request.end))}`,
      );
      url.searchParams.set('adjusted', 'true');
      url.searchParams.set('sort', 'asc');
      url.searchParams.set('limit', String(Math.min(50_000, request.totalBars)));
      url.searchParams.set('apiKey', apiKey);

      const response = await fetch(url);
      if (!response.ok) {
        throw invalidInput(`Polygon market data request failed for ${symbol}: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as PolygonAggsResponse;
      barsBySymbol[symbol] = (payload.results ?? [])
        .map((bar) => ({
          symbol,
          startTs: new Date(bar.t).toISOString(),
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
        }))
        .sort((a, b) => a.startTs.localeCompare(b.startTs))
        .slice(0, request.totalBars);
      assertEnoughBars('POLYGON', symbol, barsBySymbol[symbol]!, request.totalBars);
    }

    return {
      source: 'POLYGON',
      barsBySymbol,
    };
  }
}

interface AlpacaBarsResponse {
  bars?: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>>;
}

interface PolygonAggsResponse {
  results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
}

function toAlpacaTimeframe(interval: BarInterval): string {
  return interval === '1m' ? '1Min' : '1Day';
}

function toPolygonTimespan(interval: BarInterval): string {
  return interval === '1m' ? 'minute' : 'day';
}

function toPolygonDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function assertEnoughBars(source: MarketDataSource, symbol: string, bars: MarketBar[], totalBars: number): void {
  if (bars.length < totalBars) {
    throw invalidInput(`Not enough ${source} bars for ${symbol}: need ${totalBars}, found ${bars.length}.`);
  }
}
