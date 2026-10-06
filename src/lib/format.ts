export function formatMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

/** Numeric stock price; render the currency code separately, never a $ prefix. */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatAssetChange(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(2));
  const direction = rounded > 0 ? 1 : rounded < 0 ? -1 : 0;
  return { direction, text: `${direction > 0 ? '+' : ''}${direction === 0 ? '0.00' : rounded.toFixed(2)}%`,
    absolute: Math.abs(rounded).toFixed(2) };
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 6): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCompactMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const absolute = Math.abs(value);
  const suffix = absolute >= 1e12 ? 'T' : absolute >= 1e9 ? 'B' : absolute >= 1e6 ? 'M' : absolute >= 1e3 ? 'K' : '';
  const divisor = suffix === 'T' ? 1e12 : suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
  return `$${(value / divisor).toFixed(suffix ? 2 : 0)}${suffix}`;
}
