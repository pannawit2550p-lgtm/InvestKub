'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAssetPrice, formatBaht, fromAccountCurrency, thbToUsd, toAccountCurrency, usdToThb } from '@/lib/currency';
import { formatMoney, formatNumber } from '@/lib/format';
import { formatOpenCountdown } from '@/lib/market/hours';
import { getAssetMetadata } from '@/lib/market/mockAssets';
import { formatThaiDateTime } from '@/lib/time';
import { getBuyQuantity, getExecutionPrice, getFee, getQuantity, getTradePreviewWithConversion, getTradeValue, MIN_ORDER_VALUE, roundMoney, roundPrice, type OrderMode, type TradeSide } from '@/lib/trade/fees';
import { t } from '@/lib/i18n';
import Icon from '@/components/Icon';
import OrderConfirmationModal from '@/components/OrderConfirmationModal';
import { usePortfolio } from '@/lib/portfolio/client';

interface QuoteData {
  price: number;
  prevClose?: number;
  updatedAt: string;
  stale?: boolean;
  refreshFailed?: boolean;
  is_market_open: boolean;
  market_status?: { phase: 'pre' | 'open' | 'post' | 'closed'; nextOpenAt: string | null };
  providerUpdatedAt?: string;
  server_now?: string;
  market?: string;
  currency?: string;
  exchange?: string;
  unit?: string;
  supports_limit?: boolean;
  simulated?: boolean;
}
interface MarketOrderResult { kind: 'market'; execution_price: number; quoted_price: number; quantity: number; fee: number; currency: string; unit: string; }
interface LimitOrderResult { kind: 'limit'; id: string; side: TradeSide; quantity: number; limit_price: number; market_opens_at: string; expires_at: string; }
type OrderType = 'market' | 'limit';

export default function TradePage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params.symbol.toUpperCase();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const initialSide: TradeSide = search.get('side') === 'sell' ? 'sell' : 'buy';
  const [side, setSide] = useState<TradeSide>(initialSide);
  const [mode, setMode] = useState<OrderMode>('amount');
  const [value, setValue] = useState('0');
  const [limitPrice, setLimitPrice] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [showClosedBanner, setShowClosedBanner] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showExpiry, setShowExpiry] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checkingQuote, setCheckingQuote] = useState(false);
  const [marketPriceBlocked, setMarketPriceBlocked] = useState(false);
  const [reviewWarning, setReviewWarning] = useState('');
  const [result, setResult] = useState<MarketOrderResult | LimitOrderResult | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [clientOrderId] = useState(() => globalThis.crypto.randomUUID());
  const initializedQuote = useRef(false);
  const submittingRef = useRef(false);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);

  const quoteQuery = useQuery({ queryKey: ['quote', symbol], queryFn: async (): Promise<QuoteData> => {
    const response = await fetch(`/api/quote?symbol=${symbol}`, { cache: 'no-store' });
    const body = await response.json() as { data?: QuoteData; error?: { message: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'โหลดราคาไม่สำเร็จ');
    return body.data;
  }, staleTime: 15_000, refetchOnMount: 'always', retry: 1, retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 10_000), refetchInterval: (query) => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
    const current = query.state.data as QuoteData | undefined;
    return current?.market_status?.phase === 'closed' ? 5 * 60_000 : 60_000;
  }, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const portfolioQuery = usePortfolio();

  useEffect(() => {
    if (!quoteQuery.data || initializedQuote.current) return;
    initializedQuote.current = true;
    setLimitPrice(quoteQuery.data.price.toFixed(2));
    setOrderType(quoteQuery.data.is_market_open || !quoteQuery.data.supports_limit ? 'market' : 'limit');
  }, [quoteQuery.data]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (quoteQuery.data && !quoteQuery.data.stale && Date.now() - Date.parse(quoteQuery.data.updatedAt) <= 60_000) setMarketPriceBlocked(false);
  }, [quoteQuery.data]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void queryClient.invalidateQueries({ queryKey: ['quote', symbol] });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [queryClient, symbol]);

  const quote = quoteQuery.data;
  const metadata = getAssetMetadata(symbol);
  const currency = quote?.currency ?? metadata.currency;
  const unitLabel = quote?.unit ?? metadata.unit;
  const supportsLimit = quote?.supports_limit ?? metadata.supportsLimit;
  const marketClosed: boolean = quote?.is_market_open === false;
  const marketPhase: 'pre' | 'open' | 'post' | 'closed' = quote?.market_status?.phase ?? (marketClosed ? 'closed' : 'open');
  const marketPhaseLabel = ({ pre: 'ก่อนตลาดเปิด', open: 'เปิดอยู่', post: 'หลังตลาดปิด', closed: 'ปิดอยู่' } as const)[marketPhase];
  const nextOpenText = formatOpenCountdown(quote?.market_status?.nextOpenAt ?? null);
  const effectiveOrderType: OrderType = marketClosed && supportsLimit ? 'limit' : 'market';
  const quotedPrice = quote?.price ?? 0;
  const typedValue = Number(value) || 0;
  const typedAccountValue = mode === 'amount' ? thbToUsd(typedValue) : typedValue;
  const nativeValue = mode === 'amount' ? fromAccountCurrency(typedAccountValue, currency) : typedValue;
  const limitPriceNumber = roundPrice(Number(limitPrice) || 0);
  const toAccount = (nativeAmount: number) => toAccountCurrency(nativeAmount, currency);
  const limitQuantityNumber = limitPriceNumber > 0
    ? side === 'buy' && mode === 'amount' ? getBuyQuantity(typedAccountValue, toAccount(limitPriceNumber)) : getQuantity(mode, nativeValue, limitPriceNumber)
    : 0;
  const limitTradeValue = getTradeValue(limitQuantityNumber, toAccount(limitPriceNumber));
  const limitFee = limitQuantityNumber > 0 && limitPriceNumber > 0 ? getFee(limitTradeValue) : 0;
  const limitTotal = roundMoney(side === 'buy' ? limitTradeValue + limitFee : limitTradeValue - limitFee);
  const preview = useMemo(() => quote ? getTradePreviewWithConversion(side, mode, nativeValue, quotedPrice, (amount) => toAccountCurrency(amount, currency), (amount) => fromAccountCurrency(amount, currency)) : null, [currency, mode, nativeValue, quotedPrice, quote, side]);
  const held = portfolioQuery.data?.holdings.find((holding) => holding.symbol === symbol)?.quantity ?? 0;
  const activeQuantity = effectiveOrderType === 'limit' ? limitQuantityNumber : preview?.quantity ?? 0;
  const activeTotal = effectiveOrderType === 'limit' ? limitTotal : preview?.total ?? 0;
  const hasQuantity = activeQuantity > 0;
  const hasSellShares = side !== 'sell' || activeQuantity <= held;
  const hasBuyCash = side !== 'buy' || !portfolioQuery.data || activeTotal <= portfolioQuery.data.cash_balance;
  const hasMinimum = (effectiveOrderType === 'limit' ? limitTradeValue : preview?.tradeValue ?? 0) >= MIN_ORDER_VALUE;
  const formValid = Boolean(quote && portfolioQuery.data && typedValue > 0 && hasQuantity && hasSellShares && hasBuyCash && hasMinimum && (effectiveOrderType === 'market' ? !marketPriceBlocked : limitPriceNumber > 0));
  const maxShares = quote && portfolioQuery.data ? getBuyQuantity(portfolioQuery.data.cash_balance, toAccount(effectiveOrderType === 'limit' && limitPriceNumber > 0 ? limitPriceNumber : getExecutionPrice('buy', quotedPrice))) : 0;
  function useMaximum() {
    if (mode === 'shares') setValue(side === 'sell' ? String(held) : String(maxShares));
    else if (side === 'sell') setValue(String(usdToThb(toAccount(getTradeValue(held, effectiveOrderType === 'limit' ? limitPriceNumber : quotedPrice)))));
    else setValue(String(usdToThb(portfolioQuery.data?.cash_balance ?? 0)));
  }
  function chooseMode(nextMode: OrderMode) { setMode(nextMode); setValue(nextMode === 'shares' ? '1' : '1000'); }
  async function fetchCurrentQuote(): Promise<QuoteData> {
    const response = await fetch(`/api/quote?symbol=${symbol}&fresh=1`, { cache: 'no-store' });
    const body = await response.json() as { data?: QuoteData; error?: { message: string } };
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'ไม่สามารถอัปเดตราคาได้');
    return body.data;
  }

  function quoteIsTooOld(data: QuoteData): boolean {
    const quoteTime = data.providerUpdatedAt ? Date.parse(data.providerUpdatedAt) : Date.parse(data.updatedAt);
    return data.stale === true || !Number.isFinite(quoteTime) || (data.is_market_open && Date.now() - quoteTime > 20 * 60_000);
  }

  async function openConfirmation() {
    setError('');
    setReviewWarning('');
    if (effectiveOrderType === 'market') {
      setCheckingQuote(true);
      const priceBeforeRefresh = quotedPrice;
      try {
        const latestQuote = await fetchCurrentQuote();
        queryClient.setQueryData(['quote', symbol], latestQuote);
        if (quoteIsTooOld(latestQuote)) {
          setMarketPriceBlocked(true);
          setError('ข้อมูลราคาล่าช้า ไม่สามารถใช้คำสั่งราคาตลาดได้ในขณะนี้');
          return;
        }
        if (priceBeforeRefresh > 0 && Math.abs(latestQuote.price - priceBeforeRefresh) / priceBeforeRefresh > 0.005) {
          setReviewWarning('ราคาเปลี่ยนเกิน 0.5% จากที่แสดงก่อนหน้า โปรดตรวจสอบราคาใหม่ แล้วกดรับทราบเพื่อกลับไปตรวจคำสั่งอีกครั้ง');
        }
        setMarketPriceBlocked(false);
      } catch (cause) {
        setMarketPriceBlocked(true);
        setError(cause instanceof Error ? `${cause.message} — ข้อมูลราคาล่าช้า ไม่สามารถใช้คำสั่งราคาตลาดได้ในขณะนี้` : 'ข้อมูลราคาล่าช้า ไม่สามารถใช้คำสั่งราคาตลาดได้ในขณะนี้');
        return;
      } finally {
        setCheckingQuote(false);
      }
    }
    setShowConfirm(true);
  }
  function closeConfirmation() { if (!submittingRef.current) setShowConfirm(false); }
  async function refreshBalance() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
      queryClient.invalidateQueries({ queryKey: ['quote', symbol] }),
    ]);
  }
  async function submitMarketOrder() {
    if (!preview || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const latestQuote = await fetchCurrentQuote();
      queryClient.setQueryData(['quote', symbol], latestQuote);
      if (quoteIsTooOld(latestQuote)) {
        setMarketPriceBlocked(true);
        setError('ข้อมูลราคาล่าช้า ไม่สามารถใช้คำสั่งราคาตลาดได้ในขณะนี้');
        return;
      }
      if (quotedPrice > 0 && Math.abs(latestQuote.price - quotedPrice) / quotedPrice > 0.005) {
        setReviewWarning('ราคาเปลี่ยนเกิน 0.5% ระหว่างตรวจสอบ โปรดตรวจสอบราคาใหม่ แล้วกดรับทราบเพื่อกลับไปตรวจคำสั่งอีกครั้ง');
        return;
      }
      const response = await fetch('/api/trade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_order_id: clientOrderId, symbol, side, mode, value: mode === 'amount' ? typedAccountValue : typedValue, expected_quote_price: latestQuote.price }) });
      const body = await response.json() as { data?: Omit<MarketOrderResult, 'kind'>; error?: { code?: string; message: string } };
      if (!response.ok || !body.data) {
        if (body.error?.code === 'QUOTE_CHANGED' || body.error?.code === 'QUOTE_STALE') {
          if (body.error.code === 'QUOTE_STALE') setMarketPriceBlocked(true);
          setError(body.error.message || 'ราคาเปลี่ยนแปลงหรือกำลังอัปเดต กรุณาตรวจสอบราคาและจำนวนหุ้นใหม่');
          await queryClient.invalidateQueries({ queryKey: ['quote', symbol] });
          return;
        }
        setError(body.error?.message ?? 'ส่งคำสั่งไม่สำเร็จ');
        return;
      }
      setShowConfirm(false);
      setToast('ตั้งคำสั่งสำเร็จ');
      setResult({ kind: 'market', ...body.data });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    } catch { setError('ส่งคำสั่งไม่สำเร็จ กรุณาลองใหม่'); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }
  async function submitLimitOrder() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/limit-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_order_id: clientOrderId, symbol, side, quantity: limitQuantityNumber, limit_price: limitPriceNumber }) });
      const body = await response.json() as { data?: Omit<LimitOrderResult, 'kind'>; error?: { message: string } };
      if (!response.ok || !body.data) { setError(body.error?.message ?? 'ตั้งคำสั่งล่วงหน้าไม่สำเร็จ'); return; }
      setShowConfirm(false);
      setToast('ตั้งคำสั่งสำเร็จ');
      setResult({ kind: 'limit', ...body.data });
      await queryClient.invalidateQueries({ queryKey: ['limit-orders'] });
    } catch { setError('ตั้งคำสั่งล่วงหน้าไม่สำเร็จ กรุณาลองใหม่'); }
    finally { submittingRef.current = false; setSubmitting(false); }
  }

  function confirmFromModal() {
    if (reviewWarning) {
      setShowConfirm(false);
      setReviewWarning('');
      setError('');
      return;
    }
    if (effectiveOrderType === 'limit') void submitLimitOrder();
    else void submitMarketOrder();
  }

  if (result?.kind === 'limit') return <div className="app-content">{toast && <div className="trade-toast" role="status">{toast}</div>}<div className="card center stack"><div className="brand-mark" style={{ margin: '0 auto' }}><Icon name="clock" size={25} /></div><h1>ตั้งคำสั่งล่วงหน้าแล้ว</h1><p className="muted">รอระบบตรวจราคาเมื่อเปิดตลาด</p><div className="trade-summary"><div><span>รายการ</span><strong>{result.side === 'buy' ? 'ซื้อ' : 'ขาย'} {symbol}</strong></div><div><span>จำนวน</span><strong>{formatNumber(result.quantity)} {unitLabel}</strong></div><div><span>ราคา Limit</span><strong>{formatAssetPrice(result.limit_price, currency)}</strong></div><div><span>เริ่มตรวจ</span><strong>{formatThaiDateTime(Date.parse(result.market_opens_at))} เวลาไทย</strong></div><div><span>หมดอายุ</span><strong>{formatThaiDateTime(Date.parse(result.expires_at))} เวลาไทย</strong></div></div><Link className="primary-button center" href="/">กลับหน้าหลัก</Link><p className="auth-disclaimer">{t('disclaimer')}</p></div></div>;
  if (result?.kind === 'market') return <div className="app-content">{toast && <div className="trade-toast" role="status">{toast}</div>}<div className="card center stack"><div className="brand-mark" style={{ margin: '0 auto' }}><Icon name="check" size={25} /></div><h1>{t('orderSuccess')}</h1><p className="muted">{side === 'buy' ? t('buy') : t('sell')} {symbol}</p><div className="trade-summary"><div><span>{t('estimatedQuantity')}</span><strong>{formatNumber(result.quantity)} {result.unit}</strong></div><div><span>{t('quotedPrice')}</span><strong>{formatAssetPrice(result.quoted_price, result.currency)}</strong></div><div><span>{t('executionPrice')}</span><strong>{formatAssetPrice(result.execution_price, result.currency)}</strong></div><div><span>{t('fee')}</span><strong>{formatBaht(result.fee)}</strong></div></div><Link className="primary-button center" href="/">{t('backToPortfolio')}</Link><p className="auth-disclaimer">{t('disclaimer')}</p></div></div>;

  const amountLabel = side === 'buy' ? 'งบซื้อรวมค่าธรรมเนียม (บาท)' : 'มูลค่าที่ต้องการขาย (บาท)';
  const sharesLabel = side === 'buy' ? `จำนวน${unitLabel}ที่ต้องการซื้อ` : `จำนวน${unitLabel}ที่ต้องการขาย`;
  const invalidMessage = side === 'sell' && !hasSellShares ? `จำนวน${unitLabel}ในพอร์ตไม่พอ` : side === 'buy' && !hasBuyCash ? 'เงินสดไม่พอ' : activeTotal > 0 && !hasMinimum ? `คำสั่งซื้อขายขั้นต่ำคือ ${formatBaht(MIN_ORDER_VALUE)}` : '';
  const summaryPrice = effectiveOrderType === 'limit' ? limitPriceNumber : preview?.executionPrice;
  const quoteTimestamp = quote?.providerUpdatedAt ?? quote?.updatedAt;
  const quoteTimeLabel = quoteTimestamp ? `${quote?.providerUpdatedAt ? 'ราคา ณ' : 'อัปเดตล่าสุด'} ${formatThaiDateTime(Date.parse(quoteTimestamp))} เวลาไทย` : undefined;
  return <div className="app-content trade-screen"><header className="trade-header"><Link href={`/stock/${symbol}`} className="trade-back" aria-label="ย้อนกลับ"><Icon name="arrowLeft" size={24} /></Link><div className="trade-symbol-row"><h1 className="trade-symbol">{symbol}</h1></div><p className="trade-price">{formatAssetPrice(quotedPrice, currency)}</p>{quote?.prevClose !== undefined && <p className="trade-close-price">ราคาปิดล่าสุด: <strong>{formatAssetPrice(quote.prevClose, currency)}</strong></p>}<div className="trade-market-row"><span className="market-pill">{quote?.exchange ?? quote?.market ?? metadata.exchange}</span><span className="market-status"><i className={`market-dot ${marketPhase === 'open' ? 'open' : marketPhase === 'pre' || marketPhase === 'post' ? 'extended' : ''}`} />ตลาด: {marketPhaseLabel}</span>{nextOpenText && <span className="tiny">{nextOpenText}</span>}</div>{quoteTimestamp && <p className="trade-quote-time">{quote?.providerUpdatedAt ? 'ซื้อขายล่าสุด' : 'อัปเดตข้อมูล'} {formatThaiDateTime(Date.parse(quoteTimestamp))} เวลาไทย</p>}</header>
    <section className="payment-section"><h2 className="payment-title">บัญชีชำระเงิน</h2><div className="payment-card"><span className="payment-wallet-icon"><Icon name="wallet" size={25} /></span><div className="payment-main"><div className="payment-name">เงินสดจำลอง</div><div className="payment-subtitle">InvestKub Wallet</div></div><div className="payment-balance">{formatBaht(portfolioQuery.data?.cash_balance)}<button className="refresh-button" onClick={() => void refreshBalance()} aria-label="รีเฟรชยอดเงินสด"><Icon name="rotate" size={18} /></button></div></div></section>
    <section className={`trade-sheet ${side === 'sell' ? 'sell-sheet' : ''}`}><div className="trade-tabs" role="tablist" aria-label="รูปแบบการระบุคำสั่ง"><button role="tab" aria-selected={mode === 'amount'} className={`trade-tab ${mode === 'amount' ? 'active' : ''}`} onClick={() => chooseMode('amount')}>ระบุเงินบาท</button><button role="tab" aria-selected={mode === 'shares'} className={`trade-tab ${mode === 'shares' ? 'active' : ''}`} onClick={() => chooseMode('shares')}>ระบุ{unitLabel}</button></div><div className="trade-field"><h2 className="trade-field-title">{mode === 'amount' ? amountLabel : sharesLabel}</h2><div className={`trade-input-wrap ${invalidMessage ? 'invalid' : ''}`}><input className="trade-input" inputMode="decimal" type="number" min="0" step="any" placeholder="0" value={value} onChange={(event) => setValue(event.target.value)} aria-label={mode === 'amount' ? amountLabel : sharesLabel} /><span className="trade-input-suffix">{mode === 'amount' ? 'บาท' : unitLabel}</span></div><p className={`trade-hint ${invalidMessage ? 'invalid' : ''}`}>{invalidMessage || (mode === 'amount' ? (activeQuantity > 0 ? `ประมาณ ${formatNumber(activeQuantity)} ${unitLabel}` : 'ประมาณ') : side === 'buy' ? '' : `ถืออยู่ ${formatNumber(held)} ${unitLabel}`)}</p></div>{marketClosed && supportsLimit && showClosedBanner && <div className="trade-banner"><Icon name="sparkles" size={22} /><div className="trade-banner-content"><strong>ตลาดปิดอยู่</strong>ซื้อขายล่วงหน้าได้ด้วยคำสั่งแบบระบุราคาเอง</div><button className="dismiss-button" onClick={() => setShowClosedBanner(false)} aria-label="ปิดข้อความตลาดปิด"><Icon name="x" size={19} /></button></div>}<div className="order-type-row"><div className="order-type-label">ประเภทคำสั่ง{supportsLimit && <button className="info-button" onClick={() => setShowInfo((visible) => !visible)} aria-label="อธิบายประเภทคำสั่ง"><Icon name="sparkles" size={16} /></button>}</div>{supportsLimit ? <div className="order-type-switch"><button className={`order-type-option ${effectiveOrderType === 'market' ? 'active' : ''}`} disabled={marketClosed} onClick={() => setOrderType('market')}>ราคาตลาด</button><button className={`order-type-option ${effectiveOrderType === 'limit' ? 'active' : ''}`} disabled={!marketClosed} onClick={() => setOrderType('limit')}>ตั้งราคาเอง</button></div> : <span className="tiny muted">ราคาตลาดจำลอง</span>}{showInfo && supportsLimit && <div className="order-info-popover">ราคาตลาดใช้ราคาปัจจุบันและส่งคำสั่งทันที ส่วนตั้งราคาเองจะรอจับคู่ตามเงื่อนไขเดิมของระบบ</div>}</div>{!supportsLimit && <p className="tiny muted">กองทุนและทองคำในโหมดจำลองส่งคำสั่งด้วยราคาล่าสุดทันที</p>}{effectiveOrderType === 'limit' && <div className="limit-price-field"><label htmlFor="limit-price">ราคาที่ต้องการต่อ{unitLabel} ({currency})</label><input id="limit-price" className="limit-price-input" inputMode="decimal" type="number" min="0.0001" step="0.01" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} />{limitPriceNumber > 0 && <p className="trade-limit-converted">คิดเป็น {formatBaht(toAccount(limitPriceNumber))}</p>}{marketClosed && <p className="trade-limit-note">คำสั่งล่วงหน้าแบบ Limit: ระบบจะเริ่มตรวจเมื่อเปิดตลาด และยกเลิกอัตโนมัติหากจับคู่ไม่ได้ภายใน 24 ชั่วโมง</p>}</div>}{((effectiveOrderType === 'market' && preview && typedValue > 0) || (effectiveOrderType === 'limit' && limitPriceNumber > 0 && limitQuantityNumber > 0)) && <div className="trade-summary-box"><div className="trade-summary"><div><span>ราคาล่าสุด</span><strong>{formatAssetPrice(quotedPrice, currency)}</strong></div>{effectiveOrderType === 'limit' && <div><span>มูลค่าตามราคา Limit</span><strong>{formatBaht(limitTradeValue)}</strong></div>}{effectiveOrderType === 'market' && preview && <div><span>ราคาที่ใช้คำนวณ</span><strong>{formatAssetPrice(preview.executionPrice, currency)}</strong></div>}<div><span>ค่าธรรมเนียม</span><strong>{formatBaht(effectiveOrderType === 'limit' ? limitFee : preview?.fee)}</strong></div><div><span>ยอดสุทธิ</span><strong>{formatBaht(activeTotal)}</strong></div></div></div>}{error && <p className="error-text">{error}</p>}<div className="trade-action-row"><div className="expiry-wrap"><button className="expiry-button" onClick={() => setShowExpiry((visible) => !visible)} aria-label="ดูอายุคำสั่ง"><Icon name="clock" size={28} /></button>{showExpiry && <div className="expiry-popover">คำสั่งจะหมดอายุภายใน 24 ชั่วโมงหลังตลาดเปิด ตามเวลาหมดอายุของระบบเดิม</div>}</div><button ref={reviewButtonRef} className={`review-button ${side === 'sell' ? 'sell-review' : ''}`} disabled={!formValid || submitting || checkingQuote} onClick={() => void openConfirmation()}>{checkingQuote ? 'กำลังอัปเดตราคา…' : 'ตรวจสอบคำสั่ง'}</button></div><p className="trade-page-disclaimer">{t('simulationNote')}</p></section><OrderConfirmationModal open={showConfirm} submitting={submitting} side={side} symbol={symbol} orderType={effectiveOrderType} quantity={`${formatNumber(activeQuantity)} ${unitLabel}`} price={formatAssetPrice(summaryPrice, currency)} priceTimeLabel={quoteTimeLabel} fee={formatBaht(effectiveOrderType === 'limit' ? limitFee : preview?.fee)} total={formatBaht(activeTotal)} error={error} warning={reviewWarning} confirmLabel={reviewWarning ? 'รับทราบราคาใหม่' : effectiveOrderType === 'limit' ? 'ตั้งคำสั่งล่วงหน้า' : 'ยืนยันคำสั่ง'} returnFocusRef={reviewButtonRef} onClose={closeConfirmation} onConfirm={confirmFromModal} /></div>;
}
