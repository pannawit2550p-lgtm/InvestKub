import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: { id: 'viewer' }, rows: [] as unknown[], error: null as { message: string } | null, select: vi.fn(), process: vi.fn() }));
vi.mock('@/lib/http', () => ({
  requireUser: async () => ({ user: mocks.user }),
  ok: (data: unknown) => Response.json({ data }),
  fail: (code: string, message: string, status = 400) => Response.json({ error: { code, message } }, { status }),
}));
vi.mock('@/lib/limit-orders/process', () => ({ processLimitOrders: mocks.process }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const query = { select: (...args: unknown[]) => { mocks.select(...args); return query; }, eq: () => query, order: () => query, limit: async () => ({ data: mocks.rows, error: mocks.error }) };
  return query;
} }) }));

import { GET } from './route';

describe('limit-order settlement details', () => {
  beforeEach(() => { mocks.rows = []; mocks.error = null; vi.clearAllMocks(); });

  it('uses the filled trade ledger, not the limit or latest stock price', async () => {
    mocks.rows = [{ id: 'limit', symbol: 'MSFT', status: 'filled', limit_price: 600, execution_price: 529,
      filled_order: { side: 'buy', quantity: 100, price: 528.9844, fee: 52.9, stock: { currency: 'USD', quantity_unit: 'หุ้น' } } }];
    const body = await (await GET()).json();
    expect(body.data[0].settlement).toEqual({ side: 'buy', quantity: 100, price: 528.9844, currency: 'USD', unit: 'หุ้น', fee: 52.9, trade_value: 52898.44, cash_total: 52951.34 });
    expect(body.data[0].filled_order).toBeUndefined();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('does not present unfilled orders as already-debited cash', async () => {
    mocks.rows = [{ id: 'limit', symbol: 'MSFT', status: 'pending', filled_order: null }];
    const body = await (await GET()).json();
    expect(body.data[0].settlement).toBeUndefined();
  });

  it('preserves sale fees and computes net cash received', async () => {
    mocks.rows = [{ id: 'limit', symbol: 'AAPL', status: 'filled', filled_order: { side: 'sell', quantity: 2, price: 100, fee: 0.5, stock: null } }];
    const body = await (await GET()).json();
    expect(body.data[0].settlement).toMatchObject({ currency: 'USD', trade_value: 200, cash_total: 199.5 });
  });

  it('keeps database errors visible', async () => {
    mocks.error = { message: 'database unavailable' };
    expect((await GET()).status).toBe(500);
  });
});
