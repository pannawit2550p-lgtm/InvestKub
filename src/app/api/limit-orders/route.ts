import { z } from 'zod';
import { fail, ok, requireUser } from '@/lib/http';
import { getNextMarketOpenForSymbol, getInstrument, isMarketOpenForSymbol, toAccountValue } from '@/lib/market/instrument';
import { processLimitOrders } from '@/lib/limit-orders/process';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFee, getTradeValue, roundPrice, roundShares } from '@/lib/trade/fees';
import { limitOrderSchema } from '@/lib/trade/schema';
import { fromAccountCurrency } from '@/lib/currency';
import { getOrderCashSummary } from '@/lib/orders/trade-summary';

const cancelSchema = z.object({ id: z.string().uuid() });

export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const admin = createAdminClient();
  try {
    await processLimitOrders(user.id);
    const { data, error } = await admin.from('limit_orders').select('*, filled_order:orders!filled_order_id(side, quantity, price, fee, stock:stocks(currency, quantity_unit))').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (error) return fail('LIMIT_ORDERS_FAILED', error.message, 500);
    return ok((data ?? []).map(({ filled_order, ...order }) => {
      const filled = filled_order as unknown as { side: 'buy' | 'sell'; quantity: number; price: number; fee: number; stock: { currency: string; quantity_unit: string } | null } | null;
      if (order.status !== 'filled' || !filled) return order;
      const instrument = getInstrument(order.symbol);
      const currency = filled.stock?.currency ?? instrument.currency;
      return { ...order, settlement: {
        side: filled.side, quantity: Number(filled.quantity), price: fromAccountCurrency(Number(filled.price), currency),
        currency, unit: filled.stock?.quantity_unit ?? instrument.unit, fee: Number(filled.fee),
        ...getOrderCashSummary(filled.side, Number(filled.quantity), Number(filled.price), Number(filled.fee)),
      } };
    }));
  } catch (error) {
    return fail('LIMIT_ORDERS_FAILED', error instanceof Error ? error.message : 'โหลดคำสั่งล่วงหน้าไม่สำเร็จ', 500);
  }
}

export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const parsed = limitOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'ข้อมูลคำสั่งล่วงหน้าไม่ถูกต้อง');

  const admin = createAdminClient();
  const input = parsed.data;
  const instrument = getInstrument(input.symbol);
  if (!instrument.supportsLimit) return fail('LIMIT_UNSUPPORTED', 'สินทรัพย์นี้ใช้คำสั่งราคาตลาดเท่านั้น');
  if (isMarketOpenForSymbol(input.symbol)) return fail('MARKET_OPEN', 'ตลาดเปิดอยู่ กรุณาใช้คำสั่งซื้อขายปกติ');
  const { data: existing } = await admin.from('limit_orders').select('*').eq('user_id', user.id).eq('client_order_id', input.client_order_id).maybeSingle();
  if (existing) return ok(existing);

  const quantity = roundShares(input.quantity);
  const limitPrice = roundPrice(input.limit_price);
  if (quantity <= 0 || limitPrice <= 0) return fail('INVALID_INPUT', 'จำนวนหุ้นและราคาต้องมากกว่า 0');
  const [{ data: stock }, { data: profile }, { data: holding }] = await Promise.all([
    admin.from('stocks').select('symbol, is_active').eq('symbol', input.symbol).eq('is_active', true).maybeSingle(),
    admin.from('profiles').select('cash_balance').eq('id', user.id).single(),
    admin.from('holdings').select('quantity').eq('user_id', user.id).eq('symbol', input.symbol).maybeSingle(),
  ]);
  if (!stock) return fail('STOCK_NOT_FOUND', 'ไม่พบหุ้นนี้หรือหุ้นถูกระงับ');
  if (!profile) return fail('PROFILE_NOT_FOUND', 'ไม่พบพอร์ตของผู้ใช้', 404);
  if (input.side === 'sell' && Number(holding?.quantity ?? 0) < quantity) return fail('INSUFFICIENT_SHARES', 'จำนวนหุ้นในพอร์ตไม่พอสำหรับตั้งคำสั่งขาย');
  if (input.side === 'buy') {
    const estimatedValue = getTradeValue(quantity, toAccountValue(limitPrice, input.symbol));
    const estimatedFee = getFee(estimatedValue);
    if (Number(profile.cash_balance) < estimatedValue + estimatedFee) return fail('INSUFFICIENT_CASH', 'เงินสดไม่พอสำหรับราคาสูงสุดที่ตั้งไว้');
  }

  const marketOpensAt = getNextMarketOpenForSymbol(input.symbol);
  const expiresAt = new Date(marketOpensAt.getTime() + 24 * 60 * 60_000);
  const { data, error } = await admin.from('limit_orders').insert({
    client_order_id: input.client_order_id,
    user_id: user.id,
    symbol: input.symbol,
    side: input.side,
    quantity,
    limit_price: limitPrice,
    status: 'pending',
    market_opens_at: marketOpensAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  }).select('*').single();
  if (error) return fail('LIMIT_ORDER_FAILED', error.message, 400);
  return ok(data, { status: 201 });
}

export async function DELETE(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const parsed = cancelSchema.safeParse({ id: new URL(request.url).searchParams.get('id') ?? '' });
  if (!parsed.success) return fail('INVALID_INPUT', 'รหัสคำสั่งไม่ถูกต้อง');
  const { data, error } = await createAdminClient().from('limit_orders').update({ status: 'cancelled', failure_code: 'CANCELLED_BY_USER', failure_message: 'ผู้ใช้ยกเลิกคำสั่ง', updated_at: new Date().toISOString() }).eq('id', parsed.data.id).eq('user_id', user.id).eq('status', 'pending').select('*').maybeSingle();
  if (error) return fail('CANCEL_FAILED', error.message, 400);
  if (!data) return fail('CANNOT_CANCEL', 'คำสั่งนี้ไม่สามารถยกเลิกได้', 400);
  return ok(data);
}
