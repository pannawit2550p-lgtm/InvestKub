'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBaht } from '@/lib/currency';

export default function PortfolioChart({ data }: { data: Array<{ date: string; portfolio_value: number }> }) {
  if (data.length < 2) return <div className="card center muted">ต้องมี snapshot อย่างน้อย 2 จุดเพื่อแสดงกราฟ</div>;
  return <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><LineChart data={[...data].reverse()}><XAxis dataKey="date" hide /><YAxis hide domain={['auto', 'auto']} /><Tooltip contentStyle={{ background: '#2A2A2D', border: '1px solid #333336', borderRadius: 12, color: '#FFFFFF' }} itemStyle={{ color: '#2EE66B' }} formatter={(value) => formatBaht(Number(value))} labelFormatter={(label) => String(label)} /><Line type="monotone" dataKey="portfolio_value" stroke="#2EE66B" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div>;
}
