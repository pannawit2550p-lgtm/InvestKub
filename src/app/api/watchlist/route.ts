import { z } from 'zod';
import { fail, ok, requireUser } from '@/lib/http';

const schema = z.object({ symbol: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()) });

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const { data, error } = await supabase.from('watchlist').select('symbol, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return fail('WATCHLIST_FAILED', error.message, 400);
  return ok(data ?? []);
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('INVALID_INPUT', 'สัญลักษณ์หุ้นไม่ถูกต้อง');
  const { error } = await supabase.from('watchlist').upsert({ user_id: user.id, symbol: parsed.data.symbol });
  if (error) return fail('WATCHLIST_FAILED', error.message, 400);
  return ok({ symbol: parsed.data.symbol, watching: true });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return fail('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);
  const parsed = schema.safeParse({ symbol: new URL(request.url).searchParams.get('symbol') ?? '' });
  if (!parsed.success) return fail('INVALID_INPUT', 'สัญลักษณ์หุ้นไม่ถูกต้อง');
  const { error } = await supabase.from('watchlist').delete().eq('user_id', user.id).eq('symbol', parsed.data.symbol);
  if (error) return fail('WATCHLIST_FAILED', error.message, 400);
  return ok({ symbol: parsed.data.symbol, watching: false });
}
