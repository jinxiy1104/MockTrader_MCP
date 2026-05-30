export interface Price {
  symbol: string;
  ts: Date;
  price: number;
  source: string;
}

export interface Bar {
  symbol: string;
  startTs: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type BarInterval = '1m' | '1d';

export interface BarQueryOptions {
  start?: Date;
  end?: Date;
}

export interface MarketDataProvider {
  getLastPrice(symbol: string): Promise<Price>;
  getBars(
    symbol: string,
    interval: BarInterval,
    limit: number,
    options?: BarQueryOptions
  ): Promise<Bar[]>;
}
