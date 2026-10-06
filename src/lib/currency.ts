import { formatMoney, formatNumber } from '@/lib/format';

const configuredRate = Number(process.env.NEXT_PUBLIC_USD_THB_RATE);
export const USD_TO_THB_RATE = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 33.6;
export const STARTING_BALANCE_THB = 100_000;
export const STARTING_BALANCE_ACCOUNT = Math.round((STARTING_BALANCE_THB / USD_TO_THB_RATE) * 1_000_000) / 1_000_000;

export function usdToThb(value: number): number {
  return value * USD_TO_THB_RATE;
}

export function thbToUsd(value: number): number {
  return value / USD_TO_THB_RATE;
}

export function toAccountCurrency(value: number, currency: string): number {
  return currency === 'THB' ? thbToUsd(value) : value;
}

export function fromAccountCurrency(value: number, currency: string): number {
  return currency === 'THB' ? usdToThb(value) : value;
}

export function formatAssetPriceValue(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return currency === 'THB'
    ? formatNumber(value, 2)
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

export function formatAssetPrice(value: number | null | undefined, currency: string): string {
  const formatted = formatAssetPriceValue(value, currency);
  if (formatted === '—') return formatted;
  return currency === 'THB' ? `${formatted} บาท` : `${formatted} USD`;
}

export function formatBaht(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatNumber(usdToThb(value), 2)} บาท`;
}

export function formatStockPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatMoney(value, 'USD')} USD = ${formatBaht(value)}`;
}

export function formatCompactBaht(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const converted = usdToThb(value);
  const absolute = Math.abs(converted);
  const suffix = absolute >= 1e12 ? 'T' : absolute >= 1e9 ? 'B' : absolute >= 1e6 ? 'M' : absolute >= 1e3 ? 'K' : '';
  const divisor = suffix === 'T' ? 1e12 : suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
  return `${formatNumber(converted / divisor, suffix ? 2 : 0)}${suffix} บาท`;
}
