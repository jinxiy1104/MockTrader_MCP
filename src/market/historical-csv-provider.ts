import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BarInterval, MarketBar } from '../domain/types.js';
import { invalidInput, notFound } from '../shared/errors.js';
import { parseHistoricalCsv } from './csv-utils.js';
import { ReplayBarsRequest, ReplayBarsResult, ReplayDataProvider } from './replay-data-provider.js';

export const DEFAULT_HISTORICAL_DATASET_DIR = 'data/historical';

export class HistoricalCsvProvider implements ReplayDataProvider {
  async loadBars(request: ReplayBarsRequest): Promise<ReplayBarsResult> {
    const datasetDir = resolve(request.datasetDir ?? DEFAULT_HISTORICAL_DATASET_DIR);
    const barsBySymbol: Record<string, MarketBar[]> = {};

    for (const symbol of request.symbols) {
      const filePath = this.findDatasetFile(datasetDir, symbol, request.interval);
      const csv = readFileSync(filePath, 'utf8');
      const bars = this.filterAndLimitBars(
        parseHistoricalCsv(csv, symbol).filter((bar) => bar.symbol === symbol),
        request,
      );
      if (bars.length < request.totalBars) {
        throw invalidInput(
          `Not enough historical bars for ${symbol}: need ${request.totalBars}, found ${bars.length}.`,
        );
      }
      barsBySymbol[symbol] = bars;
    }

    return {
      source: 'HISTORICAL_CSV',
      barsBySymbol,
    };
  }

  listDatasets(datasetDir = DEFAULT_HISTORICAL_DATASET_DIR) {
    const resolved = resolve(datasetDir);
    if (!existsSync(resolved)) {
      return [];
    }

    return readdirSync(resolved)
      .filter((file) => file.toLowerCase().endsWith('.csv'))
      .map((file) => {
        const match = /^(?<symbol>[A-Za-z0-9._-]+)_(?<interval>1m|1d)\.csv$/i.exec(file);
        return {
          file,
          path: join(resolved, file),
          symbol: match?.groups?.symbol?.toUpperCase(),
          interval: match?.groups?.interval as BarInterval | undefined,
        };
      });
  }

  private findDatasetFile(datasetDir: string, symbol: string, interval: BarInterval): string {
    const candidates = [
      join(datasetDir, `${symbol}_${interval}.csv`),
      join(datasetDir, `${symbol}.csv`),
    ];

    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw notFound(
        `Historical CSV not found for ${symbol} ${interval}. Expected ${symbol}_${interval}.csv or ${symbol}.csv in ${datasetDir}.`,
      );
    }
    return found;
  }

  private filterAndLimitBars(bars: MarketBar[], request: ReplayBarsRequest): MarketBar[] {
    const startMs = request.start ? Date.parse(request.start) : undefined;
    const endMs = request.end ? Date.parse(request.end) : undefined;

    if (startMs !== undefined && Number.isNaN(startMs)) {
      throw invalidInput(`Invalid start timestamp: ${request.start}`);
    }
    if (endMs !== undefined && Number.isNaN(endMs)) {
      throw invalidInput(`Invalid end timestamp: ${request.end}`);
    }

    return bars
      .filter((bar) => {
        const ts = Date.parse(bar.startTs);
        return (startMs === undefined || ts >= startMs) && (endMs === undefined || ts <= endMs);
      })
      .sort((a, b) => a.startTs.localeCompare(b.startTs))
      .slice(0, request.totalBars);
  }
}
