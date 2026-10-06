import { z } from 'zod';

export const tradeSchema = z.object({
  client_order_id: z.string().uuid(),
  symbol: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
  side: z.enum(['buy', 'sell']),
  mode: z.enum(['amount', 'shares']),
  value: z.number().finite().positive(),
  expected_quote_price: z.number().finite().positive(),
});

export const rangeSchema = z.enum(['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y']);

export const limitOrderSchema = z.object({
  client_order_id: z.string().uuid(),
  symbol: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().finite().positive(),
  limit_price: z.number().finite().positive(),
});
