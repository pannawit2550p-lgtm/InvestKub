import { createAdminClient } from '@/lib/supabase/admin';
import { fromAccountValue, getInstrument, toAccountValue } from '@/lib/market/instrument';
import { getCachedMarketStatus, refreshCachedQuote } from '@/lib/market/cache';
import { fail, ok, requireUser } from '@/lib/http';
import { getBuyQuantity, getExecutionPrice, getFee, getQuantity, getTradeValue, MIN_ORDER_VALUE } from '@/lib/trade/fees';
import { tradeSchema } from '@/lib/trade/schema';
import { createPortfolioSnapshot } from '@/lib/portfolio/server';

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const parsed = tradeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'ข้อมูลคำสั่งไม่ถูกต้อง');
  try {
    const input = parsed.data;
    const instrument = getInstrument(input.symbol);
    const marketStatus = await getCachedMarketStatus(instrument.market);
    if (!marketStatus.isOpen) return fail('MARKET_CLOSED', 'ตลาดปิดอยู่ กรุณาใช้คำสั่งแบบระบุราคาเอง');
    const quote = await refreshCachedQuote(input.symbol);
    if (quote.stale || Date.now() - new Date(quote.updatedAt).getTime() > 60_000) return fail('QUOTE_STALE', 'ข้อมูลราคาล่าช้า ไม่สามารถใช้คำสั่งราคาตลาดได้ในขณะนี้', 409);
    if (Math.round(input.expected_quote_price * 10_000) !== Math.round(quote.price * 10_000)) {
      return fail('QUOTE_CHANGED', 'ราคาเปลี่ยนจากตอนตรวจสอบคำสั่ง กรุณาตรวจสอบราคาและจำนวนหุ้นใหม่', 409);
    }
    const nativeValue = input.mode === 'amount' ? fromAccountValue(input.value, input.symbol) : input.value;
    const nativeExecutionPrice = getExecutionPrice(input.side, quote.price);
    const executionPrice = toAccountValue(nativeExecutionPrice, input.symbol);
    const quantity = input.side === 'buy' && input.mode === 'amount'
      ? getBuyQuantity(input.value, executionPrice)
      : getQuantity(input.mode, nativeValue, quote.price);
    const quotedPrice = toAccountValue(quote.price, input.symbol);
    const tradeValue = getTradeValue(quantity, executionPrice);
    if (tradeValue < MIN_ORDER_VALUE) return fail('MINIMUM_ORDER', 'คำสั่งซื้อขายขั้นต่ำคือ 1 USD');
    const fee = getFee(tradeValue);
    const admin = createAdminClient();
    const { data: order, error } = await admin.rpc('execute_trade', { p_user_id: user.id, p_client_order_id: input.client_order_id, p_symbol: input.symbol, p_side: input.side, p_quantity: quantity, p_quoted_price: quotedPrice, p_execution_price: executionPrice, p_fee: fee });
    if (error) {
      const message = error.message;
      if (message.includes('INSUFFICIENT_CASH')) return fail('INSUFFICIENT_CASH', 'เงินสดไม่พอสำหรับคำสั่งนี้');
      if (message.includes('INSUFFICIENT_SHARES')) return fail('INSUFFICIENT_SHARES', 'จำนวนหุ้นในพอร์ตไม่พอ');
      return fail('TRADE_FAILED', message, 400);
    }
    await createPortfolioSnapshot(user.id).catch(() => undefined);
    return ok({ order, quoted_price: quote.price, execution_price: nativeExecutionPrice, quantity, fee, currency: instrument.currency, unit: instrument.unit });
  } catch (error) { return fail('TRADE_FAILED', error instanceof Error ? error.message : 'ส่งคำสั่งไม่สำเร็จ', 500); }
}
