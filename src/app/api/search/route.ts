import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { fail, ok } from '@/lib/http';
import { mockAssets } from '@/lib/market/mockAssets';

const schema = z.object({ q: z.string().trim().min(1).max(30), market: z.string().default('US') });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ q: params.get('q') ?? '', market: params.get('market') ?? 'US' });
  if (!parsed.success) return fail('INVALID_INPUT', 'กรุณาระบุคำค้นหา');
  const admin = createAdminClient();
  const query = parsed.data.q.toUpperCase();
  const mockMarkets = parsed.data.market === 'ALL' ? mockAssets : mockAssets.filter((asset) => asset.market === parsed.data.market);
  const mockResults = mockMarkets.filter((asset) => `${asset.symbol} ${asset.name}`.toLowerCase().includes(parsed.data.q.toLowerCase())).map((asset) => ({ symbol: asset.symbol, name: asset.name, exchange: asset.exchange, currency: asset.currency, logo_url: null }));
  if (parsed.data.market !== 'US' && parsed.data.market !== 'ALL') return ok(mockResults.slice(0, 20));
  const { data, error } = await admin.from('stocks').select('symbol, name, exchange, currency, logo_url').eq('market', 'US').or(`symbol.ilike.${query}%,name.ilike.%${parsed.data.q}%`).order('symbol').limit(20);
  if (error) return fail('SEARCH_FAILED', error.message, 500);
  return ok([...mockResults, ...(data ?? [])].slice(0, 20));
}
