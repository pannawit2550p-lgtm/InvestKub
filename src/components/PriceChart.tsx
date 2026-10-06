'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, TickMarkType, type IChartApi, type ISeriesApi, type MouseEventParams, type Time } from 'lightweight-charts';
import type { Candle, Range } from '@/lib/market/provider';
import { formatMoney } from '@/lib/format';
import { formatThaiDate, formatThaiDateTime, formatThaiTime, zonedDateTimeToEpochMs } from '@/lib/time';

interface ChartPoint { price: number; time: number; x: number; y: number; }

function timeToEpochMs(time: Time, timeZone: string): number {
  if (typeof time === 'number') return time * 1_000;
  if (typeof time === 'string') return Date.parse(`${time}T12:00:00Z`);
  return zonedDateTimeToEpochMs({ year: time.year, month: time.month, day: time.day, hour: 12, minute: 0 }, timeZone);
}

function formatMarketDate(timestampMs: number, timeZone: string, includeYear = false): string {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone, day: 'numeric', month: 'short', ...(includeYear ? { year: 'numeric' } : {}),
  }).format(new Date(timestampMs));
}

export default function PriceChart({
  candles, lineColor = '#A78BFA', height = 280, currency = 'USD', range = '1D',
  marketTimeZone = 'America/New_York', currentPrice,
}: {
  candles: Candle[];
  lineColor?: string;
  height?: number;
  currency?: string;
  range?: Range;
  marketTimeZone?: string;
  currentPrice?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const rangeRef = useRef(range);
  const timezoneRef = useRef(marketTimeZone);
  const currentPriceRef = useRef(currentPrice);
  const lineColorRef = useRef(lineColor);
  const [point, setPoint] = useState<ChartPoint | null>(null);
  const intraday = range === '1D' || range === '5D';

  rangeRef.current = range;
  timezoneRef.current = marketTimeZone;
  currentPriceRef.current = currentPrice;
  lineColorRef.current = lineColor;

  useEffect(() => {
    if (!container.current) return;
    const dateOnly = () => !['1D', '5D'].includes(rangeRef.current);
    const formatTime = (time: Time) => {
      const milliseconds = timeToEpochMs(time, timezoneRef.current);
      return dateOnly() ? `${formatMarketDate(milliseconds, timezoneRef.current, true)} · วันที่ตลาด` : `${formatThaiDateTime(milliseconds)} · เวลาไทย`;
    };
    const chart = createChart(container.current, {
      width: container.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9A9AA0', fontFamily: 'var(--font-noto-sans-thai), sans-serif' },
      grid: { vertLines: { visible: false }, horzLines: { color: '#333336' } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false, timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (time: Time, tickType: TickMarkType) => {
          const timestamp = timeToEpochMs(time, timezoneRef.current);
          if (dateOnly()) {
            if (tickType === TickMarkType.Year) return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: timezoneRef.current, year: 'numeric' }).format(new Date(timestamp));
            if (tickType === TickMarkType.Month) return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: timezoneRef.current, month: 'short' }).format(new Date(timestamp));
            return formatMarketDate(timestamp, timezoneRef.current);
          }
          return tickType === TickMarkType.DayOfMonth || tickType === TickMarkType.Month || tickType === TickMarkType.Year
            ? formatThaiDate(timestamp)
            : formatThaiTime(timestamp);
        },
      },
      localization: { locale: 'th-TH', timeFormatter: formatTime },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#A78BFA', width: 1, style: 2 }, horzLine: { color: '#A78BFA', width: 1, style: 2 } },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
    });
    const initialLineColor = lineColorRef.current;
    const series = chart.addAreaSeries({ lineColor: initialLineColor, topColor: `${initialLineColor}66`, bottomColor: `${initialLineColor}00`, lineWidth: 3, priceLineVisible: false, lastValueVisible: false });
    const volume = chart.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' }, color: '#6b6b73', base: 0 });
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    const crosshairMove = (param: MouseEventParams) => {
      const data = param.seriesData.get(series);
      const time = typeof param.time === 'number' ? param.time : null;
      if (!data || time === null || !param.point) { setPoint(null); return; }
      const value = 'value' in data ? Number(data.value) : 0;
      setPoint({ price: value, time, x: param.point.x, y: param.point.y });
    };
    chart.subscribeCrosshairMove(crosshairMove);
    const resize = () => { if (container.current) chart.applyOptions({ width: container.current.clientWidth }); };
    const observer = new ResizeObserver(resize);
    observer.observe(container.current);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      chart.unsubscribeCrosshairMove(crosshairMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || !candles.length) return;
    seriesRef.current.setData(candles.map((candle) => ({ time: candle.t as Time, value: candle.c })));
    volumeRef.current.setData(candles.map((candle) => ({ time: candle.t as Time, value: candle.v || 0, color: '#6b6b7355' })));
    chartRef.current?.timeScale().fitContent();
    const latest = candles[candles.length - 1];
    if (currentPriceRef.current !== undefined && Number.isFinite(currentPriceRef.current)) {
      seriesRef.current.update({ time: latest.t as Time, value: currentPriceRef.current });
    }
  }, [candles, range, marketTimeZone]);

  useEffect(() => {
    if (!seriesRef.current || !candles.length || currentPrice === undefined || !Number.isFinite(currentPrice)) return;
    seriesRef.current.update({ time: candles[candles.length - 1].t as Time, value: currentPrice });
  }, [candles, currentPrice]);

  useEffect(() => {
    seriesRef.current?.applyOptions({ lineColor, topColor: `${lineColor}66`, bottomColor: `${lineColor}00` });
  }, [lineColor]);

  const tooltipTime = point
    ? intraday ? `${formatThaiDateTime(point.time * 1_000)} · เวลาไทย` : `${formatMarketDate(point.time * 1_000, marketTimeZone, true)} · วันที่ตลาด`
    : '';

  return <div className="price-chart-wrap" style={{ height }}>
    <div ref={container} className="chart-box stock-price-chart" aria-label="กราฟราคา" />
    {point && <div className="price-chart-tooltip" style={{ left: Math.min(Math.max(point.x, 64), 260), top: Math.max(point.y - 56, 4) }}><strong>{formatMoney(point.price, currency)}</strong><span>{tooltipTime}</span></div>}
    <small className="price-chart-timezone">{intraday ? 'แกนเวลาและทูลทิป: เวลาไทย' : 'วันที่แท่งเทียน: วันซื้อขายตามเขตตลาด'}</small>
  </div>;
}
