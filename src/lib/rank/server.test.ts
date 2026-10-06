import { describe, expect, it } from 'vitest';
import { compareLeaderboardEntries, makePortfolioAllocations, toPublicLeaderboardEntry } from './calculations';

describe('compareLeaderboardEntries', () => {
  it('sorts by return, then portfolio value, then older start date', () => {
    const entries = [
      { public_id: 'd', total_pl_pct: 4, portfolio_value: 105, session_started_at: '2026-01-02' },
      { public_id: 'c', total_pl_pct: 4, portfolio_value: 110, session_started_at: '2026-01-02' },
      { public_id: 'b', total_pl_pct: 4, portfolio_value: 110, session_started_at: '2026-01-01' },
      { public_id: 'a', total_pl_pct: 5, portfolio_value: 90, session_started_at: '2026-02-01' },
    ];

    expect(entries.sort(compareLeaderboardEntries).map((entry) => entry.public_id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('toPublicLeaderboardEntry', () => {
  it('returns the public allowlist and drops private holding/user fields', () => {
    const internalEntry = {
      public_id: 'public-uuid',
      display_name: 'Trader',
      session_started_at: '2026-01-01T00:00:00Z',
      portfolio_value: 105,
      total_pl: 5,
      total_pl_pct: 5,
      starting_balance: 100,
      reward_total: 0,
      holdings_count: 1,
      rank: 1,
      authId: 'private-auth-uuid',
      email: 'private@example.com',
      quantity: 999,
      avg_cost: 123,
      orders: [{ symbol: 'AAPL' }],
    };
    const result = toPublicLeaderboardEntry(internalEntry);
    expect(Object.keys(result).sort()).toEqual([
      'display_name', 'holdings_count', 'portfolio_value', 'public_id', 'rank', 'reward_total',
      'session_started_at', 'starting_balance', 'total_pl', 'total_pl_pct',
    ].sort());
    expect(JSON.stringify(result)).not.toMatch(/private-auth|example\.com|quantity|avg_cost|orders/);
  });

  it('includes chosen avatar presentation but never exposes the private storage path', () => {
    const internalEntry = {
      public_id: 'public-uuid',
      display_name: 'Trader',
      session_started_at: '2026-01-01T00:00:00Z',
      portfolio_value: 105,
      total_pl: 5,
      total_pl_pct: 5,
      starting_balance: 100,
      reward_total: 0,
      holdings_count: 1,
      rank: 1,
      avatar_type: 'character' as const,
      avatar_character: 'cat' as const,
      avatar_url: null,
      avatar_storage_path: 'private-user-id/avatar.png',
    };
    const result = toPublicLeaderboardEntry(internalEntry);
    expect(result.avatar_type).toBe('character');
    expect(result.avatar_character).toBe('cat');
    expect(JSON.stringify(result)).not.toContain('private-user-id');
  });
});

describe('makePortfolioAllocations', () => {
  it('represents an empty portfolio as 100% cash', () => {
    const allocations = makePortfolioAllocations({ assets: [], cash_balance: 0, portfolio_value: 0 });
    expect(allocations).toEqual([{ key: 'cash', kind: 'cash', name: 'เงินสด', percent: 100, less_than_one: false }]);
  });

  it('allocates one holding against cash and totals 100%', () => {
    const allocations = makePortfolioAllocations({
      assets: [{ symbol: 'AAPL', name: 'Apple Inc.', logo_url: null, market_value: 75 }],
      cash_balance: 25,
      portfolio_value: 100,
    });
    expect(allocations.map(({ percent }) => percent)).toEqual([75, 25]);
    expect(allocations.reduce((sum, item) => sum + item.percent, 0)).toBe(100);
  });

  it('keeps the eight largest holdings, groups the rest, and uses largest-remainder rounding', () => {
    const assets = Array.from({ length: 12 }, (_, index) => ({
      symbol: `S${index + 1}`,
      name: `Company ${index + 1}`,
      logo_url: null,
      market_value: index + 1,
    }));
    const allocations = makePortfolioAllocations({ assets, cash_balance: 5, portfolio_value: 83 });

    expect(allocations.map((item) => item.key)).toEqual(['S12', 'S11', 'S10', 'other', 'S9', 'S8', 'S7', 'S6', 'S5', 'cash']);
    expect(allocations.reduce((sum, item) => sum + item.percent, 0)).toBe(100);
    expect(allocations.at(-1)?.kind).toBe('cash');
  });
});
