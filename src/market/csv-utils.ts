import { MarketBar } from '../domain/types.js';
import { invalidInput } from '../shared/errors.js';

const REQUIRED_COLUMNS = ['symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume'];

export function parseHistoricalCsv(csv: string, fallbackSymbol: string): MarketBar[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]!).map((header) => header.trim().toLowerCase());
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      throw invalidInput(`Historical CSV is missing required column: ${column}`);
    }
  }

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
    const symbol = (row.symbol || fallbackSymbol).toUpperCase();
    const timestamp = normalizeTimestamp(row.timestamp);

    return {
      symbol,
      startTs: timestamp,
      open: parseNumber(row.open, 'open'),
      high: parseNumber(row.high, 'high'),
      low: parseNumber(row.low, 'low'),
      close: parseNumber(row.close, 'close'),
      volume: parseNumber(row.volume, 'volume'),
    };
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function normalizeTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw invalidInput(`Invalid historical CSV timestamp: ${value}`);
  }
  return date.toISOString();
}

function parseNumber(value: string, column: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw invalidInput(`Invalid historical CSV ${column}: ${value}`);
  }
  return parsed;
}
