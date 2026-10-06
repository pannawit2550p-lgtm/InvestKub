export const MARKET_CONFIG = {
  US: {
    timeZone: 'America/New_York',
    preMarketOpen: 4 * 60,
    regularOpen: 9 * 60 + 30,
    regularClose: 16 * 60,
    postMarketClose: 20 * 60,
  },
  TH: {
    timeZone: 'Asia/Bangkok',
    sessions: [[10 * 60, 12 * 60 + 30], [14 * 60 + 30, 16 * 60 + 30]] as const,
  },
} as const;

// Update at the start of each year using the NYSE trading calendar.
export const US_MARKET_CALENDAR: Record<number, { holidays: string[]; earlyCloses: Record<string, string> }> = {
  2026: {
    holidays: [
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
      '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ],
    earlyCloses: { '2026-11-27': '13:00', '2026-12-24': '13:00' },
  },
};
