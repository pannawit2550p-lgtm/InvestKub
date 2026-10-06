'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePortfolio } from '@/lib/portfolio/client';
import { t } from '@/lib/i18n';
import { formatBaht } from '@/lib/currency';
import { formatPercent } from '@/lib/format';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import Icon from '@/components/Icon';
import AssetCard from '@/components/AssetCard';
import StockHoldingCard from '@/components/StockHoldingCard';
import PortfolioOverviewCarousel from '@/components/PortfolioOverviewCarousel';

function moneyParts(value: number, hidden: boolean) {
  if (hidden) return <span className="portfolio-value-hidden">••••••</span>;
  const formatted = formatBaht(value).replace(' บาท', '').split('.');
  return <>{formatted[0]}<span className="decimal">.{formatted[1] ?? '00'}</span> บาท</>;
}

export default function HomePage() {
  const [hidden, setHidden] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null);
  const query = usePortfolio();
  if (query.isLoading) return <div className="app-content"><div className="page-header"><h1 className="page-title">{t('portfolio')}</h1></div><div className="card stack"><div className="skeleton" style={{ height: 42 }} /><div className="skeleton" /><div className="skeleton" /></div></div>;
  if (!query.data) return <div className="app-content"><div className="page-header"><h1 className="page-title">{t('portfolio')}</h1></div><div className="card stack"><p className="error-text">{query.error instanceof Error ? query.error.message : 'ไม่สามารถโหลดพอร์ตได้'}</p><button className="primary-button" onClick={() => query.refetch()}>{t('retry')}</button></div></div>;
  const portfolio = query.data;
  const stockHoldings = portfolio.holdings.filter((holding) => getAssetMetadata(holding.symbol).assetType === 'stock');
  const stockValue = stockHoldings.reduce((sum, holding) => sum + holding.market_value, 0);
  const stockCost = stockHoldings.reduce((sum, holding) => sum + holding.cost_basis, 0);
  const stockPl = stockHoldings.reduce((sum, holding) => sum + holding.unrealized_pl, 0);
  const stockPlPct = stockCost > 0 ? stockPl / stockCost * 100 : 0;
  const stockDayPl = stockHoldings.reduce((sum, holding) => sum + holding.quantity * holding.stock_day_change, 0);
  const stockPreviousCloseValue = stockValue - stockDayPl;
  const stockDayPlPct = stockPreviousCloseValue > 0 ? stockDayPl / stockPreviousCloseValue * 100 : 0;
  const dayPositive = stockDayPl >= 0;
  const totalPositive = stockPl >= 0;
  const usHoldings = stockHoldings.filter((holding) => getAssetMetadata(holding.symbol).market === 'US');
  const usValue = usHoldings.reduce((sum, holding) => sum + holding.market_value, 0);
  const usCost = usHoldings.reduce((sum, holding) => sum + holding.cost_basis, 0);
  const usPl = usHoldings.reduce((sum, holding) => sum + holding.unrealized_pl, 0);
  const usPlPct = usCost > 0 ? usPl / usCost * 100 : 0;
  const updatedAt = new Date(query.dataUpdatedAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return <div className="app-content">
    <div className="page-header"><div><p className="page-kicker">สวัสดี, {portfolio.display_name || 'Trader'}</p><h1 className="page-title">{t('portfolio')} <button className="eye-button" aria-label={hidden ? 'แสดงมูลค่าพอร์ต' : 'ซ่อนมูลค่าพอร์ต'} onClick={() => setHidden((value) => !value)}><Icon name={hidden ? 'eyeOff' : 'eye'} size={22} /></button></h1></div><Link href="/orders" className="text-link">{t('history')} <Icon name="arrowRight" size={16} /></Link></div>
    {query.isRefetchError && <div className="card section" role="alert"><p className="error-text">อัปเดตพอร์ตไม่สำเร็จ กำลังแสดงข้อมูลล่าสุดที่โหลดไว้</p><button className="text-link" disabled={query.isFetching} onClick={() => void query.refetch()}>{t('retry')}</button></div>}
    <PortfolioOverviewCarousel labels={['มูลค่าหุ้นที่ถืออยู่', 'เงินสด']}>
    <section className="hero-card stock-portfolio-hero" aria-label="มูลค่าหุ้นที่ถืออยู่">
      <div className="hero-top">
        <div>
          <p className="portfolio-label">มูลค่าหุ้นที่ถืออยู่</p>
          <div className="portfolio-value">{moneyParts(stockValue, hidden)}</div>
          <div className={`change ${dayPositive ? 'gain' : 'loss'}`}><Icon name={dayPositive ? 'arrowUp' : 'arrowDown'} size={17} />{hidden ? '••••' : `${dayPositive ? '+' : '-'}${formatBaht(Math.abs(stockDayPl))} (${formatPercent(Math.abs(stockDayPlPct))})`}<span className="tiny">{t('today')}</span></div>
        </div>
        <span className="hero-updated">อัปเดตล่าสุด<br />{updatedAt}</span>
      </div>
      <div className="secondary-stats">
        <div><span>ต้นทุนหุ้นที่ถืออยู่</span><strong>{hidden ? '••••' : formatBaht(stockCost)}</strong></div>
        <div><span>กำไร/ขาดทุนหุ้นที่ถืออยู่</span><strong className={totalPositive ? 'gain' : 'loss'}>{hidden ? '••••' : `${totalPositive ? '+' : ''}${formatBaht(stockPl)} · ${formatPercent(stockPlPct)}`}</strong></div>
      </div>
      <p className="portfolio-performance-note">เทียบต้นทุนซื้อเฉลี่ย ไม่รวมค่าธรรมเนียม</p>
    </section>

    <section className="hero-card cash-portfolio-hero" aria-label="เงินสด">
      <div className="hero-top">
        <div>
          <p className="portfolio-label">เงินสดพร้อมลงทุน</p>
          <div className="portfolio-value">{moneyParts(portfolio.cash_balance, hidden)}</div>
          <p className="portfolio-cash-caption">ยอดเงินสดสำหรับซื้อหุ้น</p>
        </div>
        <span className="hero-updated">อัปเดตล่าสุด<br />{updatedAt}</span>
      </div>
      <Link href="/explore" className="portfolio-cash-action"><Icon name="wallet" size={20} />ไปหน้าลงทุน <Icon name="arrowRight" size={18} /></Link>
    </section>
    </PortfolioOverviewCarousel>

    <section className="section">
      <div className="section-heading"><h2>{t('holdings')}</h2><span className="tiny muted">{portfolio.holdings.length} หุ้น</span></div>
      {portfolio.holdings.length > 0 ? (
        <div className="stock-holding-list">
          {portfolio.holdings.map((holding) => {
            const previousClose = holding.price - holding.stock_day_change;
            const dailyChangePercent = previousClose > 0 ? holding.stock_day_change / previousClose * 100 : 0;
            const allocation = portfolio.holdings_value > 0 ? holding.market_value / portfolio.holdings_value * 100 : 0;
            return <StockHoldingCard
              key={holding.symbol}
              symbol={holding.symbol}
              logoUrl={holding.logo_url}
              allocation={allocation}
              assetValueUSD={holding.market_value}
              positionProfitLossPercent={holding.unrealized_pl_pct}
              positionProfitLossUSD={holding.unrealized_pl}
              sharesHeld={holding.quantity}
              currentPriceUSD={holding.price}
              dailyChangePercent={dailyChangePercent}
              averageCostUSD={holding.avg_cost}
              totalCostUSD={holding.cost_basis}
              expanded={expandedHolding === holding.symbol}
              onToggle={() => setExpandedHolding((current) => current === holding.symbol ? null : holding.symbol)}
            />;
          })}
        </div>
      ) : <div className="card center muted">{t('noHoldings')} <Link href="/explore" className="link">{t('exploreStocks')}</Link></div>}
    </section>
    <section className="section"><div className="section-heading"><h2>{t('assets')}</h2><button className="text-link" aria-label={t('reorder')}>{t('reorder')} <Icon name="sliders" size={16} /></button></div><div className="stack"><AssetCard icon="briefcase" tone="us" title="หุ้นสหรัฐฯ" subtitle={`${usHoldings.length} หุ้น`} total={usValue} plPct={usPlPct} plValue={usPl} hidden={hidden} href="/explore?category=us" /></div></section>
    {portfolio.holdings.some((holding) => holding.market_value > portfolio.portfolio_value * 0.5) && <section className="section card insight"><strong>พอร์ตมีการกระจุกตัวสูง</strong><p className="tiny">ลองเรียนรู้เรื่องการกระจายความเสี่ยง เพื่อเข้าใจความเสี่ยงของการถือหุ้นตัวเดียวมากเกินไป</p><Link href="/learn#diversification" className="link tiny">{t('learnMore')} <Icon name="arrowRight" size={14} /></Link></section>}
  </div>;
}
