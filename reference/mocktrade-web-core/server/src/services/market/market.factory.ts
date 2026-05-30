import { MockMarketDataProvider } from './mock.provider';
import { MarketDataProvider } from './market.provider';
import { AlpacaMarketDataProvider } from './alpaca.provider';
import { env } from '@config/env';

/**
 * Market provider factory.
 * Part 1 default: always mock provider.
 */
export const createMarketProviderFromEnv = (): MarketDataProvider => {
  if (env.marketProvider === 'alpaca') {
    if (!env.alpacaKeyId || !env.alpacaSecretKey) {
      throw new Error('ALPACA_KEY_ID and ALPACA_SECRET_KEY are required for alpaca provider');
    }

    return new AlpacaMarketDataProvider({
      keyId: env.alpacaKeyId,
      secretKey: env.alpacaSecretKey,
      baseUrl: env.alpacaDataBase,
      timeoutMs: env.marketHttpTimeoutMs,
      cacheTtlMs: env.marketCacheTtlMs,
      retryCount: env.marketRetryCount,
      latestFeed: env.alpacaLatestFeed,
      barsFeed: env.alpacaBarsFeed,
      currency: env.alpacaCurrency,
    });
  }

  const deterministic = env.nodeEnv === 'test' || env.marketMockDeterministic;
  return new MockMarketDataProvider({ deterministic });
};
