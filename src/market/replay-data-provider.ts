import { BarInterval, MarketBar, MarketDataSource } from '../domain/types.js';

export interface ReplayBarsRequest {
  symbols: string[];
  interval: BarInterval;
  totalBars: number;
  start?: string;
  end?: string;
  datasetDir?: string;
  alpacaApiKeyId?: string;
  alpacaSecretKey?: string;
  polygonApiKey?: string;
}

export interface ReplayBarsResult {
  source: MarketDataSource;
  barsBySymbol: Record<string, MarketBar[]>;
}

export interface ReplayDataProvider {
  loadBars(request: ReplayBarsRequest): Promise<ReplayBarsResult>;
}
