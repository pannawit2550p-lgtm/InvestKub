import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_LIMITS = { finnhub: { perMinute: 50, perDay: 50_000 }, twelvedata: { perMinute: 8, perDay: 800 } } as const;
const localCallTimes = new Map<string, number[]>();
const localDailyCalls = new Map<string, { day: string; calls: number }>();
const providerCooldowns = new Map<string, number>();

function configuredLimit(provider: 'finnhub' | 'twelvedata') {
  const raw = provider === 'finnhub'
    ? process.env.FINNHUB_CALLS_PER_MINUTE
    : process.env.TWELVEDATA_CALLS_PER_MINUTE;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 10_000) : DEFAULT_LIMITS[provider].perMinute;
}

function configuredDailyLimit(provider: 'finnhub' | 'twelvedata') {
  const raw = provider === 'finnhub' ? process.env.FINNHUB_CALLS_PER_DAY : process.env.TWELVEDATA_CALLS_PER_DAY;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1_000_000) : DEFAULT_LIMITS[provider].perDay;
}

function utcDay(now: number) { return new Date(now).toISOString().slice(0, 10); }

function localFallbackLimit(provider: 'finnhub' | 'twelvedata') {
  const now = Date.now();
  const calls = localCallTimes.get(provider) ?? [];
  while (calls[0] !== undefined && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= configuredLimit(provider)) throw new Error('Local provider rate limit reached');
  const day = utcDay(now);
  const daily = localDailyCalls.get(provider);
  const count = daily?.day === day ? daily.calls : 0;
  if (count >= configuredDailyLimit(provider)) throw new Error('Local provider daily quota reached');
  calls.push(now);
  localCallTimes.set(provider, calls);
  localDailyCalls.set(provider, { day, calls: count + 1 });
}

function isMissingLimiterFunction(error: { code?: string; message?: string }) {
  return error.code === 'PGRST202'
    || error.code === '42883'
    || error.message?.includes('consume_market_provider_token') === true;
}

export async function guardProviderCall(provider: 'finnhub' | 'twelvedata') {
  const coolingDownUntil = providerCooldowns.get(provider) ?? 0;
  if (coolingDownUntil > Date.now()) throw new Error(`Market provider is cooling down (${Math.ceil((coolingDownUntil - Date.now()) / 1_000)}s)`);
  providerCooldowns.delete(provider);
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    localFallbackLimit(provider);
    return;
  }

  const limit = configuredLimit(provider);
  const dailyLimit = configuredDailyLimit(provider);
  const { data, error } = await admin.rpc('consume_market_provider_token_with_daily_limit', {
    p_provider: provider,
    p_capacity: Math.min(50, limit),
    p_refill_per_second: limit / 60,
    p_daily_capacity: dailyLimit,
  });

  if (!error) {
    if (data === true) return;
    throw new Error('Market provider quota reached');
  }
  if (isMissingLimiterFunction(error)) {
    localFallbackLimit(provider);
    return;
  }
  throw new Error('Market data rate limiter unavailable');
}

export function markProviderCooldown(provider: 'finnhub' | 'twelvedata', durationMs: number) {
  providerCooldowns.set(provider, Math.max(providerCooldowns.get(provider) ?? 0, Date.now() + durationMs));
}
