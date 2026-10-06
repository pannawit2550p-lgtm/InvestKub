import { MARKET_CONFIG, US_MARKET_CALENDAR } from './market-config';
import { zonedDateTimeToEpochMs } from '@/lib/time';

export type MarketPhase = 'pre' | 'open' | 'post' | 'closed';
export interface MarketStatus {
  phase: MarketPhase;
  label: string;
  isOpen: boolean;
  nextOpenAt: string | null;
  isHoliday: boolean;
  earlyClose?: boolean;
  marketDate: string;
}

interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; weekday: string; }

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), weekday: values.weekday,
  };
}

function dateKey(parts: Pick<LocalParts, 'year' | 'month' | 'day'>): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function datePartsAfter(parts: Pick<LocalParts, 'year' | 'month' | 'day'>, offsetDays: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function isWeekend(weekday: string): boolean { return weekday === 'Sat' || weekday === 'Sun'; }

function usCalendarEntry(date: string) {
  const year = Number(date.slice(0, 4));
  const calendar = US_MARKET_CALENDAR[year];
  return { holiday: calendar?.holidays.includes(date) ?? false, earlyClose: calendar?.earlyCloses[date] };
}

function usOpenAt(dateParts: Pick<LocalParts, 'year' | 'month' | 'day'>): Date {
  const utc = zonedDateTimeToEpochMs({ ...dateParts, hour: 9, minute: 30 }, MARKET_CONFIG.US.timeZone);
  return new Date(utc);
}

export function getNextUsMarketOpen(date = new Date()): Date {
  const local = localParts(date, MARKET_CONFIG.US.timeZone);
  for (let offsetDays = 0; offsetDays < 15; offsetDays += 1) {
    const candidateParts = datePartsAfter(local, offsetDays);
    const candidateKey = dateKey(candidateParts);
    const candidateWeekday = new Intl.DateTimeFormat('en-US', { timeZone: MARKET_CONFIG.US.timeZone, weekday: 'short' })
      .format(new Date(Date.UTC(candidateParts.year, candidateParts.month - 1, candidateParts.day, 12)));
    if (isWeekend(candidateWeekday) || usCalendarEntry(candidateKey).holiday) continue;
    const candidate = usOpenAt(candidateParts);
    if (candidate.getTime() > date.getTime()) return candidate;
  }
  throw new Error('Unable to calculate next US market open');
}

export function getUsMarketStatus(date = new Date()): MarketStatus {
  const local = localParts(date, MARKET_CONFIG.US.timeZone);
  const key = dateKey(local);
  const calendar = usCalendarEntry(key);
  const minutes = local.hour * 60 + local.minute;
  const closed = isWeekend(local.weekday) || calendar.holiday;
  let phase: MarketPhase = 'closed';

  if (!closed && minutes >= MARKET_CONFIG.US.preMarketOpen && minutes < MARKET_CONFIG.US.regularOpen) phase = 'pre';
  else if (!closed && minutes >= MARKET_CONFIG.US.regularOpen) {
    const regularClose = calendar.earlyClose
      ? Number(calendar.earlyClose.slice(0, 2)) * 60 + Number(calendar.earlyClose.slice(3, 5))
      : MARKET_CONFIG.US.regularClose;
    if (minutes < regularClose) phase = 'open';
    else if (!calendar.earlyClose && minutes < MARKET_CONFIG.US.postMarketClose) phase = 'post';
  }

  const nextOpenAt = phase === 'open' ? null : getNextUsMarketOpen(date).toISOString();
  const labels: Record<MarketPhase, string> = {
    pre: 'ก่อนตลาดเปิด', open: 'เปิดอยู่', post: 'หลังตลาดปิด', closed: 'ปิดอยู่',
  };
  return { phase, label: labels[phase], isOpen: phase === 'open', nextOpenAt, isHoliday: calendar.holiday, earlyClose: Boolean(calendar.earlyClose), marketDate: key };
}

export function isUsMarketOpen(date = new Date()): boolean {
  return getUsMarketStatus(date).phase === 'open';
}

export function startOfUsTradingDay(date = new Date()): Date {
  const local = localParts(date, MARKET_CONFIG.US.timeZone);
  return new Date(zonedDateTimeToEpochMs({ year: local.year, month: local.month, day: local.day, hour: 0, minute: 0 }, MARKET_CONFIG.US.timeZone));
}

export function getNextThaiMarketOpen(date = new Date()): Date {
  const local = localParts(date, MARKET_CONFIG.TH.timeZone);
  const nowMinutes = local.hour * 60 + local.minute;
  for (let offsetDays = 0; offsetDays < 8; offsetDays += 1) {
    const parts = datePartsAfter(local, offsetDays);
    const atNoon = new Date(zonedDateTimeToEpochMs({ ...parts, hour: 12, minute: 0 }, MARKET_CONFIG.TH.timeZone));
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: MARKET_CONFIG.TH.timeZone, weekday: 'short' }).format(atNoon);
    if (isWeekend(weekday)) continue;
    for (const [openMinute] of MARKET_CONFIG.TH.sessions) {
      if (offsetDays > 0 || openMinute > nowMinutes) {
        return new Date(zonedDateTimeToEpochMs({ ...parts, hour: Math.floor(openMinute / 60), minute: openMinute % 60 }, MARKET_CONFIG.TH.timeZone));
      }
    }
  }
  throw new Error('Unable to calculate next Thai market open');
}

export function getThaiMarketStatus(date = new Date()): MarketStatus {
  const local = localParts(date, MARKET_CONFIG.TH.timeZone);
  const key = dateKey(local);
  const minutes = local.hour * 60 + local.minute;
  const open = !isWeekend(local.weekday) && MARKET_CONFIG.TH.sessions.some(([start, end]) => minutes >= start && minutes < end);
  const nextOpenAt = open ? null : getNextThaiMarketOpen(date).toISOString();
  return { phase: open ? 'open' : 'closed', label: open ? 'เปิดอยู่' : 'ปิดอยู่', isOpen: open, nextOpenAt, isHoliday: false, earlyClose: false, marketDate: key };
}

export function getMarketStatus(market: string, date = new Date()): MarketStatus {
  if (market === 'TH') return getThaiMarketStatus(date);
  if (market === 'US') return getUsMarketStatus(date);
  return { phase: 'open', label: 'ข้อมูลจำลอง', isOpen: true, nextOpenAt: null, isHoliday: false, earlyClose: false, marketDate: date.toISOString().slice(0, 10) };
}

export function isThaiMarketOpen(date = new Date()): boolean {
  return getThaiMarketStatus(date).isOpen;
}

export function isMarketOpen(market: string, date = new Date()): boolean {
  return getMarketStatus(market, date).isOpen;
}

export function getNextMarketOpen(market: string, date = new Date()): Date {
  if (market === 'TH') return getNextThaiMarketOpen(date);
  if (market === 'US') return getNextUsMarketOpen(date);
  return new Date(date.getTime() + 60_000);
}

export function formatOpenCountdown(nextOpenAt: string | null, now = new Date()): string | null {
  if (!nextOpenAt) return null;
  const remainingMs = Math.max(0, new Date(nextOpenAt).getTime() - now.getTime());
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `จะเปิดใน ${hours} ชม. ${minutes} นาที`;
}
