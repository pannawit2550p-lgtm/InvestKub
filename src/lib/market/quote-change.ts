export interface ChangePresentation {
  change: number;
  changePercent: number;
  roundedPercent: number;
  direction: -1 | 0 | 1;
  text: string;
}

/** Canonical signed change used for the displayed number, arrow, and color. */
export function getChangePresentation(price: number, previousClose: number): ChangePresentation | null {
  if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose <= 0) return null;
  const change = price - previousClose;
  const changePercent = change / previousClose * 100;
  const roundedPercent = Number(changePercent.toFixed(2));
  const direction: ChangePresentation['direction'] = roundedPercent > 0 ? 1 : roundedPercent < 0 ? -1 : 0;
  const text = direction > 0 ? `+${roundedPercent.toFixed(2)}%`
    : direction < 0 ? `−${Math.abs(roundedPercent).toFixed(2)}%` : '–';
  return { change, changePercent, roundedPercent, direction, text };
}
