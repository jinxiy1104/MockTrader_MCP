import { MarketDataService } from '../../../src/services/market.service';
import { MarketDataProvider } from '../../../src/services/market/market.provider';

describe('MarketDataService', () => {
  it('returns normalized latest price from provider', async () => {
    const provider: MarketDataProvider = {
      getLastPrice: jest.fn().mockResolvedValue({
        symbol: 'AAPL',
        ts: new Date('2026-01-01T10:00:00.000Z'),
        price: 189.23,
        source: 'MOCK',
      }),
      getBars: jest.fn().mockResolvedValue([]),
    };

    const service = new MarketDataService(provider);
    const price = await service.getPrice('AAPL');

    expect(provider.getLastPrice).toHaveBeenCalledWith('AAPL');
    expect(price).toEqual({
      symbol: 'AAPL',
      timestamp: new Date('2026-01-01T10:00:00.000Z'),
      price: 189.23,
      source: 'MOCK',
    });
  });
});
