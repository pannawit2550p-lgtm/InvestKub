export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  updatedAt: string;
  providerUpdatedAt?: string;
  providerTimestampRaw?: number;
  providerTimestampUnit?: 'seconds';
}

export interface Fundamentals {
  symbol: string;
  marketCap?: number;
  epsTtm?: number;
  week52High?: number;
  week52Low?: number;
  dividendYield?: number;
  sector?: string;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Range = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y';

export interface MarketProvider {
  getQuote(symbol: string): Promise<Quote>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
  getCandles(symbol: string, range: Range): Promise<Candle[]>;
  listSymbols(market: string): Promise<{ symbol: string; name: string; exchange?: string; currency: string }[]>;
}

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
