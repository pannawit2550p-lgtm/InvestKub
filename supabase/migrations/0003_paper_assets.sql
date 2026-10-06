-- PaperTrade asset catalog for Thai equities, mutual funds and gold.
-- Prices for these instruments are simulated in the application until live providers are configured.

alter table public.stocks add column if not exists asset_type text not null default 'stock';
alter table public.stocks add column if not exists quantity_unit text not null default 'หุ้น';
alter table public.stocks add column if not exists supports_limit boolean not null default true;

update public.stocks
set asset_type = 'stock', quantity_unit = 'หุ้น', supports_limit = true
where market = 'US';

insert into public.stocks (symbol, name, exchange, market, currency, asset_type, quantity_unit, supports_limit, is_active)
values
  ('PTT', 'ปตท. จำกัด (มหาชน)', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('CPALL', 'ซีพี ออลล์ จำกัด (มหาชน)', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('AOT', 'ท่าอากาศยานไทย จำกัด (มหาชน)', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('KBANK', 'ธนาคารกสิกรไทย จำกัด (มหาชน)', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('SCB', 'เอสซีบี เอกซ์ จำกัด (มหาชน)', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('ADVANC', 'แอดวานซ์ อินโฟร์ เซอร์วิส', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('DELTA', 'เดลต้า อีเลคโทรนิคส์ (ประเทศไทย)', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('GULF', 'กัลฟ์ เอ็นเนอร์จี ดีเวลลอปเมนท์', 'SET', 'TH', 'THB', 'stock', 'หุ้น', true, true),
  ('SCBSP500', 'กองทุนเปิดไทยพาณิชย์หุ้นยูเอส 500', 'กองทุนรวม', 'FUND', 'THB', 'fund', 'หน่วยลงทุน', false, true),
  ('K-FIXED', 'กองทุนเปิดเค ตราสารหนี้', 'กองทุนรวม', 'FUND', 'THB', 'fund', 'หน่วยลงทุน', false, true),
  ('TDEX', 'กองทุนเปิดไทยเด็กซ์ SET50', 'กองทุนรวม', 'FUND', 'THB', 'fund', 'หน่วยลงทุน', false, true),
  ('KT-GOLD', 'กองทุนเปิดเคแทม โกลด์ ฟันด์', 'กองทุนรวม', 'FUND', 'THB', 'fund', 'หน่วยลงทุน', false, true),
  ('XAUUSD', 'ทองคำสปอต', 'ตลาดทองคำ', 'GOLD', 'USD', 'gold', 'หน่วย', false, true),
  ('GOLD-TH', 'ทองคำแท่ง 96.5%', 'ตลาดทองคำ', 'GOLD', 'THB', 'gold', 'บาททองคำ', false, true)
on conflict (symbol) do update set
  name = excluded.name,
  exchange = excluded.exchange,
  market = excluded.market,
  currency = excluded.currency,
  asset_type = excluded.asset_type,
  quantity_unit = excluded.quantity_unit,
  supports_limit = excluded.supports_limit,
  is_active = true;

create index if not exists stocks_market_asset_type_idx on public.stocks (market, asset_type, is_active);
