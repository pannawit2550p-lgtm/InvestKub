const THAI_TIME_ZONE = 'Asia/Bangkok';

export function formatThaiShortDate(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return '—';
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone: THAI_TIME_ZONE, day: 'numeric', month: 'short', year: '2-digit',
  }).format(new Date(timestampMs));
}

export type TimestampUnit = 'seconds' | 'milliseconds';

export function timestampToMilliseconds(value: number, unit: TimestampUnit): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return unit === 'seconds' ? value * 1_000 : value;
}

export function formatThaiDateTime(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return '—';
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone: THAI_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestampMs));
}

export function formatThaiTime(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return '—';
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone: THAI_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestampMs));
}

export function formatThaiDate(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return '—';
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone: THAI_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestampMs));
}

export function relativeAge(timestampMs: number, nowMs = Date.now()): string {
  if (!Number.isFinite(timestampMs)) return 'ไม่ทราบเวลา';
  const deltaSeconds = Math.round((timestampMs - nowMs) / 1_000);
  const absolute = Math.abs(deltaSeconds);
  const unit: Intl.RelativeTimeFormatUnit = absolute < 60
    ? 'second'
    : absolute < 3_600 ? 'minute' : absolute < 86_400 ? 'hour' : 'day';
  const divisor = unit === 'second' ? 1 : unit === 'minute' ? 60 : unit === 'hour' ? 3_600 : 86_400;
  const rounded = Math.round(deltaSeconds / divisor);
  const phrase = new Intl.RelativeTimeFormat('th', { numeric: 'auto' }).format(rounded, unit);
  return rounded < 0 ? `เมื่อ${phrase}` : phrase;
}

export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

function partsInTimeZone(timestampMs: number, timeZone: string): Required<ZonedDateTimeParts> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

/** Convert a wall-clock date/time in an IANA timezone to an epoch timestamp. */
export function zonedDateTimeToEpochMs(parts: ZonedDateTimeParts, timeZone: string): number {
  const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
  let guess = targetUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = partsInTimeZone(guess, timeZone);
    const representedUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second);
    const nextGuess = guess + targetUtc - representedUtc;
    if (nextGuess === guess) break;
    guess = nextGuess;
  }
  return guess;
}

export function zonedDateKey(timestampMs: number, timeZone: string): string {
  const parts = partsInTimeZone(timestampMs, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Provider equity timestamps are wall-clock exchange times unless an offset is included. */
export function parseExchangeDateTime(value: string, timeZone: string): number {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return Date.parse(value);
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return Number.NaN;
  return zonedDateTimeToEpochMs({
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4] ?? 12), minute: Number(match[5] ?? 0), second: Number(match[6] ?? 0),
  }, timeZone);
}
