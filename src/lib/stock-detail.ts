import type { Fundamentals } from '@/lib/market/provider';
import type { MockAsset } from '@/lib/market/mockAssets';

export interface DividendSnapshot {
  yieldPct: number;
  perShare: number;
  frequency: string;
  history: Array<{ exDate: string; paymentDate: string; amount: number }>;
}

/** Mock-only fallback kept separate so a real dividends endpoint can replace it later. */
export function getDividends(_symbol: string): DividendSnapshot | null {
  return null;
}

/** Mock fundamentals deliberately omit unknown numbers instead of inventing them. */
export function getMockFundamentals(_asset: MockAsset): Fundamentals {
  return { symbol: _asset.symbol };
}

export function getAssetTypeLabel(asset: MockAsset | undefined): string {
  if (!asset) return 'หุ้นสามัญ';
  if (asset.category === 'gold') return 'ทองคำ';
  if (asset.category === 'fund') return 'กองทุนรวม';
  if (asset.category === 'th') return 'หุ้นไทย';
  return 'หุ้นสหรัฐฯ';
}
