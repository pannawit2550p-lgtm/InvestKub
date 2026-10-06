import { getCachedQuote } from '@/lib/market/cache';
import { isMarketOpenForSymbol, toAccountValue } from '@/lib/market/instrument';
import { createPortfolioSnapshot } from '@/lib/portfolio/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getExecutionPrice, getFee, getTradeValue, type TradeSide } from '@/lib/trade/fees';
import { shouldFillLimitOrder } from './match';

interface LimitOrderRow {
  id: string;
  client_order_id: string;
  user_id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  limit_price: number;
  expires_at: string;
}

interface FilledOrder { id: string; }

export interface ProcessLimitOrdersResult {
  checked: number;
  filled: number;
  expired: number;
  failed: number;
  marketOpen: boolean;
}

export async function processLimitOrders(userId?: string): Promise<ProcessLimitOrdersResult> {
  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleProcessingCutoff = new Date(now.getTime() - 10 * 60_000).toISOString();

  let recoverQuery = admin.from('limit_orders').update({ status: 'pending', updated_at: nowIso }).eq('status', 'processing').lt('updated_at', staleProcessingCutoff);
  if (userId) recoverQuery = recoverQuery.eq('user_id', userId);
  await recoverQuery;

  let expiringQuery = admin.from('limit_orders').select('id').eq('status', 'pending').lte('expires_at', nowIso);
  if (userId) expiringQuery = expiringQuery.eq('user_id', userId);
  const { data: expiringRows } = await expiringQuery;
  const expiringIds = (expiringRows ?? []).map((row) => String(row.id));
  if (expiringIds.length > 0) {
    await admin.from('limit_orders').update({ status: 'expired', failure_code: 'LIMIT_NOT_REACHED', failure_message: 'จับคู่ไม่สำเร็จภายใน 24 ชั่วโมงหลังตลาดเปิด', updated_at: nowIso }).in('id', expiringIds).eq('status', 'pending');
  }

  let pendingQuery = admin.from('limit_orders').select('*').eq('status', 'pending').gt('expires_at', nowIso).order('created_at', { ascending: true }).limit(200);
  if (userId) pendingQuery = pendingQuery.eq('user_id', userId);
  const { data, error } = await pendingQuery;
  if (error) throw new Error(error.message);
  const pendingOrders = (data ?? []) as LimitOrderRow[];
  const marketOpen = pendingOrders.some((order) => isMarketOpenForSymbol(order.symbol, now));
  const symbols = [...new Set(pendingOrders.map((order) => order.symbol))];
  const quoteEntries = await Promise.all(symbols.map(async (symbol) => {
    try { return [symbol, await getCachedQuote(symbol)] as const; } catch { return null; }
  }));
  const quotes = Object.fromEntries(quoteEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));

  let filled = 0;
  let failed = 0;
  for (const order of pendingOrders) {
    if (!isMarketOpenForSymbol(order.symbol, now)) continue;
    const quote = quotes[order.symbol];
    if (!quote || quote.stale || now.getTime() - new Date(quote.updatedAt).getTime() > 60_000) continue;
    const nativeExecutionPrice = getExecutionPrice(order.side, quote.price);
    if (!shouldFillLimitOrder(order.side, nativeExecutionPrice, Number(order.limit_price))) continue;

    const { data: claimed } = await admin.from('limit_orders').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', order.id).eq('status', 'pending').select('*').maybeSingle();
    if (!claimed) continue;

    const quantity = Number(order.quantity);
    const quotedPrice = toAccountValue(quote.price, order.symbol);
    const executionPrice = toAccountValue(nativeExecutionPrice, order.symbol);
    const fee = getFee(getTradeValue(quantity, executionPrice));
    const { data: executed, error: tradeError } = await admin.rpc('execute_trade', {
      p_user_id: order.user_id,
      p_client_order_id: order.client_order_id,
      p_symbol: order.symbol,
      p_side: order.side,
      p_quantity: quantity,
      p_quoted_price: quotedPrice,
      p_execution_price: executionPrice,
      p_fee: fee,
    });

    if (tradeError) {
      const insufficientCash = tradeError.message.includes('INSUFFICIENT_CASH');
      const insufficientShares = tradeError.message.includes('INSUFFICIENT_SHARES');
      const failureCode = insufficientCash ? 'INSUFFICIENT_CASH' : insufficientShares ? 'INSUFFICIENT_SHARES' : 'EXECUTION_FAILED';
      const failureMessage = insufficientCash ? 'เงินสดไม่เพียงพอในเวลาจับคู่' : insufficientShares ? 'จำนวนหุ้นไม่เพียงพอในเวลาจับคู่' : 'ไม่สามารถดำเนินคำสั่งได้';
      await admin.from('limit_orders').update({ status: 'failed', failure_code: failureCode, failure_message: failureMessage, quoted_price: quote.price, execution_price: nativeExecutionPrice, fee, updated_at: new Date().toISOString() }).eq('id', order.id);
      failed += 1;
      continue;
    }

    const filledOrder = (Array.isArray(executed) ? executed[0] : executed) as FilledOrder | null;
    await admin.from('limit_orders').update({ status: 'filled', quoted_price: quote.price, execution_price: nativeExecutionPrice, fee, filled_order_id: filledOrder?.id ?? null, failure_code: null, failure_message: null, updated_at: new Date().toISOString() }).eq('id', order.id);
    await createPortfolioSnapshot(order.user_id).catch(() => undefined);
    filled += 1;
  }

  return { checked: pendingOrders.length, filled, expired: expiringIds.length, failed, marketOpen };
}
