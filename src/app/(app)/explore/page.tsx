'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { t } from '@/lib/i18n';
import AssetRow, { AssetRowSkeleton } from '@/components/AssetRow';
import Icon from '@/components/Icon';
import MarketOverview from '@/components/MarketOverview';

type SortMode = 'popular' | 'up' | 'down';
type SectorId = 'all' | 'technology' | 'materials' | 'energy' | 'healthcare' | 'financials' | 'industrials' | 'communication' | 'utilities' | 'real-estate';

interface SearchResult { symbol: string; name: string; exchange?: string; currency?: string; logo_url?: string | null; }
interface Quote { symbol: string; price: number; changePct: number; name?: string; logo_url?: string | null; currency?: string | null; stale?: boolean; }
interface Sector { id: Exclude<SectorId, 'all'>; label: string; symbols: string[]; }

const sectors: Sector[] = [
  { id: 'technology', label: 'เทคโนโลยี', symbols: ['AAPL', 'MSFT', 'NVDA', 'AMD', 'ORCL', 'INTC', 'AVGO', 'CRM', 'ADI', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'MCHP', 'MRVL', 'SNPS', 'CDNS', 'NOW', 'INTU', 'IBM', 'CSCO', 'PANW', 'CRWD', 'FTNT', 'DDOG', 'SNOW', 'PLTR', 'SHOP', 'SQ', 'TSLA', 'UBER', 'ABNB', 'ROKU', 'ARM', 'SMCI', 'DELL', 'HPQ', 'HPE', 'WDC', 'STX', 'ON', 'NXPI', 'ZS', 'OKTA', 'MDB', 'NET', 'APP', 'GDDY', 'FSLY', 'TSM', 'ASML', 'SAP', 'VRT', 'AI', 'PATH', 'TEAM', 'U', 'ENPH'] },
  { id: 'materials', label: 'วัสดุพื้นฐาน', symbols: ['LIN', 'APD', 'NEM', 'SHW', 'FCX', 'NUE', 'DD', 'DOW', 'ECL', 'VMC', 'MLM', 'CTVA', 'MOS', 'CF', 'ALB', 'EMN', 'IFF', 'IP', 'PKG', 'AMCR', 'BALL', 'AVY', 'CLF', 'STLD', 'RS', 'CENX', 'SCCO', 'TECK', 'RIO', 'BHP', 'VALE', 'GOLD', 'LYB', 'OLN', 'HUN', 'CE', 'WLK', 'FMC', 'RPM', 'CCK', 'SEE', 'OI', 'ATI', 'HXL', 'RGLD', 'FNV', 'PAAS', 'AG', 'MP', 'TKR', 'CSTM', 'ICL', 'SAND', 'USLM', 'LOMA', 'SUM', 'CX', 'CMC', 'UAN', 'KALU'] },
  { id: 'energy', label: 'พลังงาน', symbols: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'PSX', 'VLO', 'MPC', 'HAL', 'BKR', 'KMI', 'WMB', 'OKE', 'ET', 'ENB', 'FANG', 'DVN', 'MRO', 'APA', 'CTRA', 'CNX', 'EQT', 'RRC', 'LNG', 'TRGP', 'RIG', 'HPK', 'NOG', 'OVV', 'MGY', 'CHK', 'AR', 'DINO', 'NOV', 'FTI', 'CHX', 'LBRT', 'NBR', 'PTEN', 'WFRD', 'TELL', 'PBF', 'MTDR', 'SM', 'CRC', 'KNTK', 'VTLE', 'OII', 'VAL', 'HES', 'TALO', 'NINE', 'AMR', 'ARCH', 'BTU', 'CEIX', 'HNRG', 'FLNG', 'GLOP'] },
  { id: 'healthcare', label: 'สุขภาพ', symbols: ['LLY', 'JNJ', 'PFE', 'UNH', 'ABBV', 'MRK', 'TMO', 'AMGN', 'ABT', 'BMY', 'GILD', 'CVS', 'CI', 'HUM', 'ELV', 'ISRG', 'MDT', 'SYK', 'BSX', 'EW', 'ZTS', 'REGN', 'VRTX', 'BIIB', 'MRNA', 'MRVI', 'DXCM', 'HCA', 'IDXX', 'IQV', 'CAH', 'MCK', 'COR', 'DHR', 'A', 'DVA', 'ALGN', 'RMD', 'PODD', 'HOLX', 'INCY', 'BAX', 'BDX', 'ZBH', 'ROP', 'STE', 'ALNY', 'VEEV', 'IOVA', 'LH', 'NVO', 'AZN', 'SAVA', 'ACHC', 'THC', 'UHS', 'COO', 'PEN', 'XRAY', 'GMED'] },
  { id: 'financials', label: 'การเงิน', symbols: ['JPM', 'BAC', 'V', 'MA', 'GS', 'MS', 'BLK', 'C', 'WFC', 'SCHW', 'AXP', 'COF', 'USB', 'PNC', 'TFC', 'BK', 'STT', 'CME', 'ICE', 'SPGI', 'MCO', 'MSCI', 'CBOE', 'NDAQ', 'HOOD', 'SOFI', 'PYPL', 'ALL', 'CB', 'TRV', 'AIG', 'MET', 'PRU', 'AFL', 'AMP', 'RJF', 'FITB', 'HBAN', 'KEY', 'RF', 'CFG', 'MTB', 'SYF', 'FIS', 'FISV', 'GPN', 'COIN', 'BX', 'KKR', 'APO', 'CG', 'DFS', 'HDB', 'IBN', 'TROW', 'BEN', 'NTRS', 'CACC', 'OMF', 'UPST', 'LC'] },
  { id: 'industrials', label: 'อุตสาหกรรม', symbols: ['CAT', 'GE', 'HON', 'UPS', 'RTX', 'BA', 'DE', 'LMT', 'UNP', 'CSX', 'NSC', 'WM', 'RSG', 'EMR', 'ETN', 'PH', 'DOV', 'ITW', 'MMM', 'GD', 'NOC', 'TDG', 'CARR', 'OTIS', 'JCI', 'FDX', 'FAST', 'PCAR', 'CMI', 'GWW', 'ROK', 'SWK', 'ABB', 'WAB', 'IR', 'XYL', 'URI', 'PWR', 'BLDR', 'ACM', 'MAS', 'OC', 'OSK', 'TEX', 'GNRC', 'HEI', 'HWM', 'CW', 'AOS', 'SNA', 'CNI', 'CP', 'LECO', 'AGCO', 'HII', 'KTOS', 'SPR', 'RRX', 'AIT', 'RBC'] },
  { id: 'communication', label: 'สื่อสาร', symbols: ['GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR', 'PARA', 'WBD', 'FOX', 'FOXA', 'NWS', 'NWSA', 'SPOT', 'RDDT', 'SNAP', 'PINS', 'TTWO', 'EA', 'LYV', 'MTCH', 'IAC', 'ZM', 'RBLX', 'DKNG', 'IPG', 'OMC', 'NYT', 'SIRI', 'TKO', 'WMG', 'FUBO', 'WIX', 'VOD', 'BMBL', 'GOGO', 'CARG', 'YELP', 'TGNA', 'NXST', 'CABO', 'LUMN', 'AMCX', 'MSGS', 'MSGE', 'FWONA', 'FWONK', 'CURI', 'DUOL', 'ZI', 'APPN', 'BILI', 'WB', 'VIPS', 'BZFD', 'GTN', 'SBGI', 'MSGM'] },
  { id: 'utilities', label: 'สาธารณูปโภค', symbols: ['NEE', 'DUK', 'SO', 'AEP', 'EXC', 'SRE', 'XEL', 'ED', 'CEG', 'VST', 'DTE', 'EIX', 'PEG', 'WEC', 'ES', 'FE', 'PPL', 'CMS', 'CNP', 'NI', 'EVRG', 'LNT', 'AES', 'AEE', 'AWK', 'WTRG', 'SJW', 'CWT', 'PCG', 'OGE', 'UTL', 'IDA', 'POR', 'BKH', 'MDU', 'SWX', 'NRG', 'TLN', 'ENLT', 'BEP', 'BEPC', 'CWEN', 'CWEN.A', 'AY', 'AGR', 'ORA', 'AMPS', 'NEP', 'AWR', 'NJR', 'D', 'ETR', 'AQN', 'BIP', 'PNW', 'UGI', 'NWE', 'NFE', 'EE', 'OGS'] },
  { id: 'real-estate', label: 'อสังหาริมทรัพย์', symbols: ['PLD', 'AMT', 'EQIX', 'O', 'SPG', 'CCI', 'WELL', 'PSA', 'DLR', 'OHI', 'VICI', 'CUBE', 'AVB', 'EQR', 'ESS', 'INVH', 'UDR', 'CPT', 'ARE', 'BXP', 'VTR', 'DOC', 'KIM', 'REG', 'FRT', 'HST', 'HHC', 'REXR', 'STAG', 'WPC', 'NNN', 'HIW', 'SLG', 'ESRT', 'PEAK', 'RHP', 'RYN', 'LXP', 'DEA', 'LAND', 'SUI', 'MAA', 'EPR', 'EXR', 'GLPI', 'IRM', 'COLD', 'BRX', 'FR', 'ADC', 'VNO', 'KRC', 'CUZ', 'PDM', 'TRNO', 'IRT', 'AHH', 'NXRT', 'SRC', 'ELS'] },
];

const visibleSectors = sectors.slice(0, 5);
const popular = [...new Set(sectors.flatMap((sector) => sector.symbols))];
const PAGE_SIZE = 20;
const stockNames: Record<string, string> = {
  AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'NVIDIA', AMD: 'Advanced Micro Devices',
  LIN: 'Linde', APD: 'Air Products', NEM: 'Newmont', SHW: 'Sherwin-Williams',
  XOM: 'Exxon Mobil', CVX: 'Chevron', COP: 'ConocoPhillips', SLB: 'SLB',
  LLY: 'Eli Lilly', JNJ: 'Johnson & Johnson', PFE: 'Pfizer', UNH: 'UnitedHealth',
  JPM: 'JPMorgan Chase', BAC: 'Bank of America', V: 'Visa', MA: 'Mastercard',
  ORCL: 'Oracle', INTC: 'Intel', AVGO: 'Broadcom', CRM: 'Salesforce',
  FCX: 'Freeport-McMoRan', NUE: 'Nucor', DD: 'DuPont', DOW: 'Dow',
  EOG: 'EOG Resources', OXY: 'Occidental Petroleum', PSX: 'Phillips 66', VLO: 'Valero Energy',
  ABBV: 'AbbVie', MRK: 'Merck', TMO: 'Thermo Fisher Scientific', AMGN: 'Amgen',
  GS: 'Goldman Sachs', MS: 'Morgan Stanley', BLK: 'BlackRock', C: 'Citigroup',
  RTX: 'RTX', BA: 'Boeing', DE: 'Deere', LMT: 'Lockheed Martin',
  GOOGL: 'Alphabet', META: 'Meta Platforms', NFLX: 'Netflix', DIS: 'Disney',
  CMCSA: 'Comcast', T: 'AT&T', VZ: 'Verizon', TMUS: 'T-Mobile US',
  CAT: 'Caterpillar', GE: 'GE Aerospace', HON: 'Honeywell', UPS: 'UPS',
  NEE: 'NextEra Energy', DUK: 'Duke Energy', SO: 'Southern Company', AEP: 'American Electric Power',
  EXC: 'Exelon', SRE: 'Sempra', XEL: 'Xcel Energy', ED: 'Consolidated Edison',
  PLD: 'Prologis', AMT: 'American Tower', EQIX: 'Equinix', O: 'Realty Income',
  SPG: 'Simon Property Group', CCI: 'Crown Castle', WELL: 'Welltower', PSA: 'Public Storage',
};

async function searchStocks(query: string) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&market=US`);
  const body = await response.json() as { data?: SearchResult[] };
  return body.data ?? [];
}

async function getQuotes(symbols: string[]) {
  const batches = Array.from({ length: Math.ceil(symbols.length / 20) }, (_, index) => symbols.slice(index * 20, index * 20 + 20));
  const responses = await Promise.all(batches.map(async (batch) => {
    const response = await fetch(`/api/quotes?symbols=${batch.join(',')}`);
    const body = await response.json() as { data?: Record<string, Quote> };
    return body.data ?? {};
  }));
  return Object.assign({}, ...responses);
}

const labels: Record<SortMode, string> = { popular: 'ยอดนิยม', up: 'ขึ้นแรง', down: 'ลงแรง' };

function getSectorLabel(sector: SectorId) {
  if (sector === 'all') return 'หุ้นสหรัฐฯ ทั้งหมด';
  return sectors.find((item) => item.id === sector)?.label ?? 'หุ้นสหรัฐฯ';
}

export default function ExplorePage() {
  const [sector, setSector] = useState<SectorId>('all');
  const [sort, setSort] = useState<SortMode>('popular');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('sector') as SectorId | null;
    if (value === 'all' || (value !== null && sectors.some((item) => item.id === value))) setSector(value);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sector, sort]);

  const results = useQuery({ queryKey: ['search', debounced, 'US'], queryFn: () => searchStocks(debounced), enabled: debounced.length > 0, staleTime: 5 * 60_000 });
  const searchSymbols = results.data?.map((item) => item.symbol) ?? [];
  const searchQuotes = useQuery<Record<string, Quote>>({
    queryKey: ['search-quotes', searchSymbols],
    queryFn: () => getQuotes(searchSymbols),
    enabled: searchSymbols.length > 0,
    staleTime: 5 * 60_000,
  });
  const selectedSymbols = useMemo(() => sector === 'all' ? popular : sectors.find((item) => item.id === sector)?.symbols ?? [], [sector]);
  const symbolsToLoad = selectedSymbols.slice(0, visibleCount);
  const quotes = useQuery<Record<string, Quote>>({ queryKey: ['explore-quotes', symbolsToLoad], queryFn: () => getQuotes(symbolsToLoad), staleTime: 5 * 60_000, enabled: symbolsToLoad.length > 0 });
  const quoteRows = Object.values(quotes.data ?? {}).filter((quote) => selectedSymbols.includes(quote.symbol));
  const sortedQuotes = sort === 'up' ? [...quoteRows].sort((a, b) => b.changePct - a.changePct) : sort === 'down' ? [...quoteRows].sort((a, b) => a.changePct - b.changePct) : quoteRows;
  const shownSectors = showAllCategories ? sectors : visibleSectors;

  return <div className="app-content">
    <div className="page-header"><div><p className="page-kicker">ตลาดสหรัฐฯ</p><h1 className="page-title">{t('invest')}</h1></div><span className="chip active">US · USD</span></div>
    <div className="search-wrap"><span className="search-icon"><Icon name="search" size={20} /></span><input aria-label={t('search')} placeholder="ค้นหาหุ้นสหรัฐฯ หรือสัญลักษณ์" value={search} onChange={(event) => setSearch(event.target.value)} />{debounced && <div className="dropdown asset-list">{results.isLoading ? <><AssetRowSkeleton /><AssetRowSkeleton /><AssetRowSkeleton /></> : results.data?.length ? results.data.map((item) => { const quote = searchQuotes.data?.[item.symbol]; return <AssetRow key={item.symbol} symbol={item.symbol} name={item.name} logoUrl={item.logo_url} price={quote?.price} changePct={quote?.changePct} currency={item.currency} />; }) : <p className="muted tiny">{t('noData')}</p>}</div>}</div>
    <MarketOverview />
    <section className="section"><div className="section-heading"><h2>หมวดหมู่หุ้น</h2><button className="text-link" onClick={() => setShowAllCategories((value) => !value)}>{showAllCategories ? 'ซ่อนหมวดหมู่' : 'แสดงหมวดหมู่ทั้งหมด'} <Icon name="chevronDown" className={showAllCategories ? 'rotated' : ''} size={16} /></button></div><div className="sector-category-grid"><button className={`sector-category-button ${sector === 'all' ? 'active' : ''}`} onClick={() => setSector('all')}>หุ้นทั้งหมด</button>{shownSectors.map((item) => <button key={item.id} className={`sector-category-button ${sector === item.id ? 'active' : ''}`} onClick={() => setSector(item.id)}>{item.label}</button>)}</div></section>
    <div className="explore-sort-row"><span className="filter-label">เรียงตาม</span><div className="sort-controls">{(Object.keys(labels) as SortMode[]).map((value) => <button key={value} className={`sort-button ${sort === value ? 'active' : ''}`} onClick={() => setSort(value)}>{labels[value]}</button>)}</div></div>
    <section className="section"><div className="section-heading asset-list-heading"><h2>{getSectorLabel(sector)}</h2><span className="tiny muted">{quoteRows.some((quote) => quote.stale) && <>{t('staleData')} · </>}แสดง {sortedQuotes.length} จาก {selectedSymbols.length} หุ้น · USD</span></div><div className="card asset-list">{quotes.isLoading ? Array.from({ length: symbolsToLoad.length }, (_, index) => <AssetRowSkeleton key={index} />) : sortedQuotes.length ? sortedQuotes.map((quote) => <AssetRow key={quote.symbol} symbol={quote.symbol} name={quote.name ?? stockNames[quote.symbol]} logoUrl={quote.logo_url} price={quote.price} currency={quote.currency ?? 'USD'} changePct={quote.changePct} showWatchAction={false} />) : <p className="empty-card">ยังไม่มีข้อมูลของหมวดหมู่นี้</p>}</div>{visibleCount < selectedSymbols.length && <button className="load-more-button" onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, selectedSymbols.length))}>ดูเพิ่ม <Icon name="chevronDown" size={18} /></button>}</section>
    <p className="tiny muted section">แสดงเฉพาะหุ้นสหรัฐฯ · ราคาอ้างอิงเป็น USD</p>
  </div>;
}
