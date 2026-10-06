import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'homeFilled'
  | 'chart'
  | 'chartFilled'
  | 'pieChart'
  | 'receipt'
  | 'receiptFilled'
  | 'trophy'
  | 'trophyFilled'
  | 'book'
  | 'bookFilled'
  | 'user'
  | 'userFilled'
  | 'eye'
  | 'eyeOff'
  | 'arrowRight'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'share'
  | 'plus'
  | 'chevronDown'
  | 'flag'
  | 'search'
  | 'sliders'
  | 'wallet'
  | 'briefcase'
  | 'globe'
  | 'landmark'
  | 'coins'
  | 'settings'
  | 'logOut'
  | 'rotate'
  | 'chevronRight'
  | 'clock'
  | 'check'
  | 'x'
  | 'sparkles'
  | 'info'
  | 'pencil'
  | 'mail'
  | 'key'
  | 'alert';

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></>,
  homeFilled: <><path d="m3 10 9-7 9 7v11H5V10Z" /><path fill="var(--bg)" stroke="none" d="M9 21v-6h6v6" /></>,
  chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /></>,
  chartFilled: <><path d="M4 19V5" /><path d="M4 19h16" /><path fill="currentColor" stroke="none" d="m7 15 3-4 3 2 5-7v9H7Z" /></>,
  pieChart: <><path d="M11 3.1A9 9 0 1 0 20.9 13H11V3.1Z" /><path d="M14 3.5V10h6.5A9 9 0 0 0 14 3.5Z" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  receiptFilled: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" fill="currentColor" /><path d="M9 8h6M9 12h6M9 16h3" stroke="var(--bg)" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" /></>,
  trophyFilled: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" fill="currentColor" /><path d="M8 21h8M12 17v4M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v17H6a2 2 0 0 0-2 2V5Z" /><path d="M4 20a2 2 0 0 1 2-2h13" /></>,
  bookFilled: <><path d="M4 5a2 2 0 0 1 2-2h13v17H6a2 2 0 0 0-2 2V5Z" fill="currentColor" /><path d="M4 20a2 2 0 0 1 2-2h13" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  userFilled: <><circle cx="12" cy="8" r="4" fill="currentColor" /><path d="M4 21a8 8 0 0 1 16 0" fill="currentColor" /></>,
  eye: <><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="m3 3 18 18M10.6 6.7A9.8 9.8 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a17 17 0 0 1-3.1 3.4M6.7 6.7C4 8.3 2.5 12 2.5 12S6 17.5 12 17.5c1.1 0 2.1-.2 3-.5" /></>,
  arrowRight: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
  arrowLeft: <><path d="M20 12H5M11 6l-6 6 6 6" /></>,
  arrowUp: <><path d="M12 19V5M6 11l6-6 6 6" /></>,
  arrowDown: <><path d="M12 5v14M6 13l6 6 6-6" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  flag: <><path d="M5 21V4M5 5c4-3 7 3 14 0v9c-7 3-10-3-14 0" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  sliders: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="var(--card)" /><circle cx="15" cy="12" r="2" fill="var(--card)" /><circle cx="11" cy="18" r="2" fill="var(--card)" /></>,
  wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" /><path d="M4 7h13a2 2 0 0 1 2 2v2H16a2 2 0 0 0 0 4h3v2" /><circle cx="16.5" cy="13" r=".7" fill="currentColor" stroke="none" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  landmark: <><path d="M3 10h18L12 4 3 10Z" /><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" /></>,
  coins: <><circle cx="9" cy="9" r="5" /><path d="M13 7.5A5 5 0 1 1 9 14" /><path d="M9 6v6M7 8h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>,
  logOut: <><path d="M10 17l5-5-5-5M15 12H3M19 4h2v16h-2" /></>,
  rotate: <><path d="M20 11a8 8 0 0 0-14-4L4 9" /><path d="M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 20v-5h-5" /></>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  sparkles: <><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  pencil: <><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" /><path d="m13 6 5 5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-2 2" /></>,
  alert: <><path d="M12 3 2.8 19a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
};

export default function Icon({ name, size = 24, strokeWidth = 1.8, ...props }: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
