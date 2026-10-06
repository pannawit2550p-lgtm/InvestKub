import type { Quote } from './provider';

export type AssetCategory = 'all' | 'us' | 'th' | 'fund' | 'gold';
export type AssetType = 'stock' | 'fund' | 'gold';
export type MarketCode = 'US' | 'TH' | 'FUND' | 'GOLD';

export interface AssetMetadata {
  symbol: string;
  assetType: AssetType;
  market: MarketCode;
  currency: 'USD' | 'THB';
  exchange: string;
  unit: string;
  supportsLimit: boolean;
  simulated: boolean;
}

export interface MockAsset {
  symbol: string;
  name: string;
  category: Exclude<AssetCategory, 'all'>;
  assetType: AssetType;
  market: Exclude<MarketCode, 'US'>;
  exchange: string;
  unit: string;
  supportsLimit: boolean;
  currency: 'USD' | 'THB';
  price: number;
  changePct: number;
  mock: true;
}

export const mockAssets: MockAsset[] = [
  { symbol: 'PTT', name: 'ปตท. จำกัด (มหาชน)', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 32.25, changePct: 0.78, mock: true },
  { symbol: 'CPALL', name: 'ซีพี ออลล์ จำกัด (มหาชน)', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 58.5, changePct: -0.42, mock: true },
  { symbol: 'AOT', name: 'ท่าอากาศยานไทย จำกัด (มหาชน)', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 64.75, changePct: 1.16, mock: true },
  { symbol: 'KBANK', name: 'ธนาคารกสิกรไทย จำกัด (มหาชน)', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 128.5, changePct: -0.19, mock: true },
  { symbol: 'SCB', name: 'เอสซีบี เอกซ์ จำกัด (มหาชน)', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 111, changePct: 0.55, mock: true },
  { symbol: 'ADVANC', name: 'แอดวานซ์ อินโฟร์ เซอร์วิส', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 227, changePct: 0.88, mock: true },
  { symbol: 'DELTA', name: 'เดลต้า อีเลคโทรนิคส์ (ประเทศไทย)', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 92.25, changePct: -1.32, mock: true },
  { symbol: 'GULF', name: 'กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์', category: 'th', assetType: 'stock', market: 'TH', exchange: 'SET', unit: 'หุ้น', supportsLimit: true, currency: 'THB', price: 46.5, changePct: 1.74, mock: true },
  { symbol: 'SCBSP500', name: 'กองทุนเปิดไทยพาณิชย์หุ้นยูเอส 500', category: 'fund', assetType: 'fund', market: 'FUND', exchange: 'กองทุนรวม', unit: 'หน่วยลงทุน', supportsLimit: false, currency: 'THB', price: 18.42, changePct: 0.38, mock: true },
  { symbol: 'K-FIXED', name: 'กองทุนเปิดเค ตราสารหนี้', category: 'fund', assetType: 'fund', market: 'FUND', exchange: 'กองทุนรวม', unit: 'หน่วยลงทุน', supportsLimit: false, currency: 'THB', price: 10.86, changePct: 0.05, mock: true },
  { symbol: 'TDEX', name: 'กองทุนเปิดไทยเด็กซ์ SET50', category: 'fund', assetType: 'fund', market: 'FUND', exchange: 'กองทุนรวม', unit: 'หน่วยลงทุน', supportsLimit: false, currency: 'THB', price: 8.21, changePct: -0.24, mock: true },
  { symbol: 'KT-GOLD', name: 'กองทุนเปิดเคแทม โกลด์ ฟันด์', category: 'fund', assetType: 'fund', market: 'FUND', exchange: 'กองทุนรวม', unit: 'หน่วยลงทุน', supportsLimit: false, currency: 'THB', price: 14.72, changePct: 0.92, mock: true },
  { symbol: 'XAUUSD', name: 'ทองคำสปอต', category: 'gold', assetType: 'gold', market: 'GOLD', exchange: 'ตลาดทองคำ', unit: 'หน่วย', supportsLimit: false, currency: 'USD', price: 2654.8, changePct: 0.41, mock: true },
  { symbol: 'GOLD-TH', name: 'ทองคำแท่ง 96.5%', category: 'gold', assetType: 'gold', market: 'GOLD', exchange: 'ตลาดทองคำ', unit: 'บาททองคำ', supportsLimit: false, currency: 'THB', price: 42750, changePct: 0.35, mock: true },
];

export function getMockAsset(symbol: string): MockAsset | undefined {
  return mockAssets.find((asset) => asset.symbol === symbol.trim().toUpperCase());
}

export function getAssetMetadata(symbol: string): AssetMetadata {
  const asset = getMockAsset(symbol);
  if (asset) {
    return { symbol: asset.symbol, assetType: asset.assetType, market: asset.market, currency: asset.currency, exchange: asset.exchange, unit: asset.unit, supportsLimit: asset.supportsLimit, simulated: true };
  }
  return { symbol: symbol.trim().toUpperCase(), assetType: 'stock', market: 'US', currency: 'USD', exchange: 'NASDAQ', unit: 'หุ้น', supportsLimit: true, simulated: false };
}

export function getMockQuote(symbol: string): Quote | null {
  const asset = getMockAsset(symbol);
  if (!asset) return null;
  const change = asset.price * asset.changePct / 100;
  return { symbol: asset.symbol, price: asset.price, prevClose: asset.price - change, change, changePct: asset.changePct, open: asset.price - change / 2, high: asset.price * 1.01, low: asset.price * 0.99, updatedAt: new Date().toISOString() };
}

export const categories: Array<{ id: AssetCategory; label: string }> = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'us', label: 'หุ้นสหรัฐฯ' },
  { id: 'th', label: 'หุ้นไทย' },
  { id: 'fund', label: 'กองทุนรวม' },
  { id: 'gold', label: 'ทองคำ' },
];

export function filterMockAssets(category: AssetCategory, query: string, sort: 'popular' | 'up' | 'down') {
  const normalized = query.trim().toLowerCase();
  const items = mockAssets.filter((asset) => (category === 'all' || asset.category === category) && (!normalized || `${asset.symbol} ${asset.name}`.toLowerCase().includes(normalized)));
  if (sort === 'up') return [...items].sort((a, b) => b.changePct - a.changePct);
  if (sort === 'down') return [...items].sort((a, b) => a.changePct - b.changePct);
  return items;
}
