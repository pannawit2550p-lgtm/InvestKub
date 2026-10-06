import { fromAccountCurrency, toAccountCurrency } from '@/lib/currency';
import { getAssetMetadata } from './mockAssets';
import { getNextMarketOpen, isMarketOpen } from './hours';

export function getInstrument(symbol: string) {
  return getAssetMetadata(symbol);
}

export function isMarketOpenForSymbol(symbol: string, date = new Date()): boolean {
  return isMarketOpen(getInstrument(symbol).market, date);
}

export function getNextMarketOpenForSymbol(symbol: string, date = new Date()): Date {
  return getNextMarketOpen(getInstrument(symbol).market, date);
}

export function toAccountValue(value: number, symbol: string): number {
  return toAccountCurrency(value, getInstrument(symbol).currency);
}

export function fromAccountValue(value: number, symbol: string): number {
  return fromAccountCurrency(value, getInstrument(symbol).currency);
}
