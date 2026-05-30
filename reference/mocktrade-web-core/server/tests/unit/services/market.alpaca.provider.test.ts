import { AlpacaMarketDataProvider } from '../../../src/services/market/alpaca.provider';
import { MarketDataUnavailableError } from '../../../src/utils/errors';

const latestFixture = require('../../fixtures/market/alpaca-latest-trade.json');
const barsFixture = require('../../fixtures/market/alpaca-bars-1m.json');

describe('AlpacaMarketDataProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('maps latest trade response to internal Price format', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(latestFixture), { status: 200 })
    ) as any;

    const provider = new AlpacaMarketDataProvider({
      keyId: 'key',
      secretKey: 'secret',
      baseUrl: 'https://data.alpaca.markets',
      cacheTtlMs: 1000,
      timeoutMs: 1000,
    });

    const price = await provider.getLastPrice('aapl');

    expect(price.symbol).toBe('AAPL');
    expect(price.price).toBe(191.23);
    expect(price.source).toBe('ALPACA');
    expect(price.ts.toISOString()).toBe('2026-02-20T15:59:59.123Z');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/v2/stocks/trades/latest?'
    );
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('symbols=AAPL');
  });

  it('maps bars response to internal Bar format', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(barsFixture), { status: 200 })
    ) as any;

    const provider = new AlpacaMarketDataProvider({
      keyId: 'key',
      secretKey: 'secret',
      baseUrl: 'https://data.alpaca.markets',
      cacheTtlMs: 1000,
      timeoutMs: 1000,
    });

    const bars = await provider.getBars('AAPL', '1m', 3);

    expect(bars).toHaveLength(3);
    expect(bars[0]).toEqual({
      symbol: 'AAPL',
      startTs: new Date('2026-02-20T15:57:00.000Z'),
      open: 190.8,
      high: 191,
      low: 190.7,
      close: 190.95,
      volume: 1200,
    });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/v2/stocks/bars?');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('symbols=AAPL');
  });

  it('forwards start/end query params for bars', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(barsFixture), { status: 200 })
    ) as any;

    const provider = new AlpacaMarketDataProvider({
      keyId: 'key',
      secretKey: 'secret',
      baseUrl: 'https://data.alpaca.markets',
      cacheTtlMs: 1000,
      timeoutMs: 1000,
    });

    const start = new Date('2026-02-20T15:30:00.000Z');
    const end = new Date('2026-02-20T16:00:00.000Z');
    await provider.getBars('AAPL', '1m', 3, { start, end });

    const requestedUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(requestedUrl).toContain('start=2026-02-20T15%3A30%3A00.000Z');
    expect(requestedUrl).toContain('end=2026-02-20T16%3A00%3A00.000Z');
  });

  it('retries bars with fallback lookback window when initial response is empty', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ bars: { AAPL: [] } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(barsFixture), { status: 200 })
      ) as any;

    const provider = new AlpacaMarketDataProvider({
      keyId: 'key',
      secretKey: 'secret',
      baseUrl: 'https://data.alpaca.markets',
      cacheTtlMs: 1000,
      timeoutMs: 1000,
    });

    const bars = await provider.getBars('AAPL', '1m', 3);

    expect(bars).toHaveLength(3);
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2);
    const fallbackUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string;
    expect(fallbackUrl).toContain('start=');
    expect(fallbackUrl).toContain('end=');
  });

  it('uses cache for repeated latest price calls within TTL', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(latestFixture), { status: 200 })
    );
    global.fetch = fetchMock as any;

    const provider = new AlpacaMarketDataProvider({
      keyId: 'key',
      secretKey: 'secret',
      cacheTtlMs: 10_000,
      timeoutMs: 1000,
    });

    await provider.getLastPrice('AAPL');
    await provider.getLastPrice('AAPL');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns controlled error for 429 response', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'rate limit' }), { status: 429 })
    ) as any;

    const provider = new AlpacaMarketDataProvider({
      keyId: 'key',
      secretKey: 'secret',
      cacheTtlMs: 1000,
      timeoutMs: 1000,
      retryCount: 0,
    });

    await expect(provider.getLastPrice('AAPL')).rejects.toThrow(MarketDataUnavailableError);
  });
});
