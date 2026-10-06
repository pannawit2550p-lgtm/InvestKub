import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromAccountCurrency } from '@/lib/currency';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import { lessons } from '@/content/lessons';
import { REWARD_PER_LESSON } from '@/content/lesson-settings';
import { fail, ok, requireUser } from '@/lib/http';
import { historyPage, ORDER_HISTORY_PAGE_SIZE, type HistoryCursor } from '@/lib/orders/history-pagination';
import { getOrderCashSummary } from '@/lib/orders/trade-summary';

const querySchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  tradeSkip: z.coerce.number().int().min(0).max(100_000).default(0),
  rewardSkip: z.coerce.number().int().min(0).max(100_000).default(0),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.\-]{0,19}$/).optional(),
}).refine((value) => value.before || (value.tradeSkip === 0 && value.rewardSkip === 0));

export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return fail('INVALID_INPUT', 'ข้อมูลหน้ารายการไม่ถูกต้อง');
  const { before, tradeSkip, rewardSkip, symbol } = parsed.data;
  const cursor: HistoryCursor | undefined = before ? { before, tradeSkip, rewardSkip } : undefined;
  const admin = createAdminClient();
  let tradeQuery = admin.from('orders').select('id, symbol, side, quantity, price, quoted_price, fee, realized_pl, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).order('id', { ascending: false });
  let rewardQuery = admin.from('lesson_progress').select('lesson_id, reward_amount, reward_claimed_at')
    .eq('user_id', user.id).in('lesson_id', lessons.map((lesson) => lesson.id))
    .not('reward_claimed_at', 'is', null).order('reward_claimed_at', { ascending: false }).order('lesson_id', { ascending: false });
  if (symbol) tradeQuery = tradeQuery.eq('symbol', symbol);
  if (before) {
    tradeQuery = tradeQuery.lte('created_at', before);
    rewardQuery = rewardQuery.lte('reward_claimed_at', before);
  }
  const [{ data, error }, { data: rewards, error: rewardsError }] = await Promise.all([
    tradeQuery.range(tradeSkip, tradeSkip + ORDER_HISTORY_PAGE_SIZE),
    symbol ? Promise.resolve({ data: [], error: null }) : rewardQuery.range(rewardSkip, rewardSkip + ORDER_HISTORY_PAGE_SIZE),
  ]);
  if (error) return fail('ORDERS_FAILED', error.message, 500);
  if (rewardsError) return fail('ORDERS_FAILED', 'โหลดรายการรางวัลไม่สำเร็จ', 500);
  const symbols = [...new Set((data ?? []).map((order) => order.symbol))];
  const { data: stocks } = symbols.length ? await admin.from('stocks').select('symbol, currency, quantity_unit').in('symbol', symbols) : { data: [] };
  const stockMap = Object.fromEntries((stocks ?? []).map((stock) => [stock.symbol, stock]));
  const marketItems = (data ?? []).map((order) => {
    const metadata = getAssetMetadata(order.symbol);
    const currency = stockMap[order.symbol]?.currency ?? metadata.currency;
    return { ...order, kind: 'trade' as const,
      ...getOrderCashSummary(order.side as 'buy' | 'sell', Number(order.quantity), Number(order.price), Number(order.fee)),
      price: fromAccountCurrency(Number(order.price), currency), quoted_price: fromAccountCurrency(Number(order.quoted_price), currency), currency, unit: stockMap[order.symbol]?.quantity_unit ?? metadata.unit };
  });
  const rewardItems = (rewards ?? []).flatMap((reward) => {
    const lesson = lessons.find((item) => item.id === reward.lesson_id);
    return lesson && reward.reward_claimed_at ? [{
      id: `lesson-reward-${reward.lesson_id}`,
      kind: 'lesson_reward' as const,
      lessonId: reward.lesson_id,
      title: lesson.title,
      amount: Number(reward.reward_amount ?? 0),
      amountTHB: REWARD_PER_LESSON,
      created_at: reward.reward_claimed_at,
    }] : [];
  });
  return ok(historyPage([...marketItems, ...rewardItems], cursor));
}
