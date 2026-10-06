import { queryOptions, useQuery } from '@tanstack/react-query';

export interface PortfolioData {
  display_name: string; portfolio_value: number; cash_balance: number; holdings_value: number;
  starting_balance: number; reward_balance: number; total_pl: number; realized_pl: number; total_pl_pct: number;
  day_pl_total: number | null; day_pl_pct: number | null;
  holdings: Array<{ symbol: string; name: string; logo_url?: string | null; quantity: number; avg_cost: number; price: number; stock_day_change: number; cost_basis: number; market_value: number; unrealized_pl: number; unrealized_pl_pct: number }>;
  history: Array<{ date: string; portfolio_value: number }>;
}

export const portfolioQueryOptions = queryOptions({ queryKey: ['portfolio'], queryFn: async ({ signal }): Promise<PortfolioData> => {
    const response = await fetch('/api/portfolio', { signal });
    const body = await response.json() as { data?: PortfolioData; error?: { message: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'โหลดพอร์ตไม่สำเร็จ');
    return body.data;
  }, staleTime: 60_000, gcTime: 15 * 60_000, refetchOnMount: true, refetchInterval: 60_000, refetchIntervalInBackground: false });

export function usePortfolio() {
  return useQuery(portfolioQueryOptions);
}
