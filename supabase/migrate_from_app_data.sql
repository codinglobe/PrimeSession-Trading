-- Migration from legacy app_data (JSON blob) into normalized tables.
-- Assumes public.app_data(user_id uuid, data jsonb, updated_at timestamptz) exists.

-- 1) Profiles
insert into public.user_profiles (user_id, username, display_name, email, is_admin, is_active)
select
  a.user_id,
  p.key as username,
  initcap(p.key) as display_name,
  nullif(p.value->>'email', '') as email,
  coalesce((p.value->>'flag')::boolean, false) as is_admin,
  coalesce((p.value->>'active')::boolean, true) as is_active
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
where p.key <> 'guest'
on conflict (user_id, username) do update
set
  display_name = excluded.display_name,
  email = excluded.email,
  is_admin = excluded.is_admin,
  is_active = excluded.is_active,
  updated_at = now();

-- 2) Settings (1 row per profile)
insert into public.user_settings (
  profile_id,
  theme,
  default_timeframe,
  default_leverage,
  default_orders,
  default_risk_percent,
  default_scale_mode,
  show_chart_link,
  tp_count,
  tp_percents,
  runner_percent
)
select
  up.id,
  coalesce(p.value#>>'{settings,theme}', 'dark'),
  coalesce(p.value#>>'{settings,defaultTimeframe}', '15m'),
  coalesce((p.value#>>'{settings,defaultLeverage}')::int, 10),
  coalesce((p.value#>>'{settings,defaultOrders}')::int, 5),
  coalesce((p.value#>>'{settings,defaultRiskPercent}')::numeric, 0.5),
  coalesce(p.value#>>'{settings,defaultScaleMode}', 'flat'),
  coalesce((p.value#>>'{settings,showChartLink}')::boolean, false),
  coalesce((p.value#>>'{settings,tpScheme,tpCount}')::int, 4),
  coalesce(p.value#>'{settings,tpScheme,tpPercents}', '[30,25,20,15]'::jsonb),
  coalesce((p.value#>>'{settings,tpScheme,runnerPercent}')::numeric, 10)
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
join public.user_profiles up on up.user_id = a.user_id and up.username = p.key
where p.key <> 'guest'
on conflict (profile_id) do update
set
  theme = excluded.theme,
  default_timeframe = excluded.default_timeframe,
  default_leverage = excluded.default_leverage,
  default_orders = excluded.default_orders,
  default_risk_percent = excluded.default_risk_percent,
  default_scale_mode = excluded.default_scale_mode,
  show_chart_link = excluded.show_chart_link,
  tp_count = excluded.tp_count,
  tp_percents = excluded.tp_percents,
  runner_percent = excluded.runner_percent,
  updated_at = now();

-- 3) Calculator trades
insert into public.calculator_trades (
  id, profile_id, title, symbol, timeframe, direction, setup_confirmed_at, chart_link, sl,
  lower_price, upper_price, leverage, risk_percent, balance, mode, scale_mode,
  order_count, single_entry_price, tp_scheme, tp_targets, transferred, journal_trade_id
)
select
  ct.value->>'id' as id,
  up.id as profile_id,
  coalesce(ct.value->>'title', '(ohne Titel)') as title,
  coalesce(ct.value->>'symbol', 'UNKNOWN') as symbol,
  ct.value->>'timeframe' as timeframe,
  coalesce(ct.value->>'direction', 'long') as direction,
  nullif(ct.value->>'setupConfirmedAt', '')::timestamptz,
  ct.value->>'chartLink',
  (ct.value->>'sl')::numeric,
  (ct.value->>'lower')::numeric,
  (ct.value->>'upper')::numeric,
  (ct.value->>'leverage')::int,
  (ct.value->>'riskPercent')::numeric,
  (ct.value->>'balance')::numeric,
  ct.value->>'mode',
  ct.value->>'scaleMode',
  (ct.value->>'orderCount')::int,
  (ct.value->>'singleEntryPrice')::numeric,
  ct.value->'tpScheme',
  ct.value->'tpTargets',
  coalesce((ct.value->>'transferred')::boolean, false),
  ct.value->>'journalId'
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
join public.user_profiles up on up.user_id = a.user_id and up.username = p.key
cross join lateral jsonb_array_elements(coalesce(p.value->'calculatorTrades', '[]'::jsonb)) as ct(value)
where p.key <> 'guest' and nullif(ct.value->>'id','') is not null
on conflict (id) do update
set
  title = excluded.title,
  symbol = excluded.symbol,
  timeframe = excluded.timeframe,
  direction = excluded.direction,
  setup_confirmed_at = excluded.setup_confirmed_at,
  chart_link = excluded.chart_link,
  sl = excluded.sl,
  lower_price = excluded.lower_price,
  upper_price = excluded.upper_price,
  leverage = excluded.leverage,
  risk_percent = excluded.risk_percent,
  balance = excluded.balance,
  mode = excluded.mode,
  scale_mode = excluded.scale_mode,
  order_count = excluded.order_count,
  single_entry_price = excluded.single_entry_price,
  tp_scheme = excluded.tp_scheme,
  tp_targets = excluded.tp_targets,
  transferred = excluded.transferred,
  journal_trade_id = excluded.journal_trade_id,
  updated_at = now();

-- 3a) Orders
insert into public.calculator_trade_orders (calculator_trade_id, line_no, plan_price, plan_qty)
select
  ct.value->>'id' as calculator_trade_id,
  (ord.idx + 1) as line_no,
  (ord.item->>'planPrice')::numeric,
  (ord.item->>'planQty')::numeric
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
cross join lateral jsonb_array_elements(coalesce(p.value->'calculatorTrades', '[]'::jsonb)) as ct(value)
cross join lateral jsonb_array_elements(coalesce(ct.value->'orders', '[]'::jsonb)) with ordinality as ord(item, idx)
where p.key <> 'guest' and nullif(ct.value->>'id','') is not null
on conflict (calculator_trade_id, line_no) do update
set plan_price = excluded.plan_price, plan_qty = excluded.plan_qty;

-- 3b) Fills
insert into public.calculator_trade_fills (id, calculator_trade_order_id, filled_at, price, qty, fee)
select
  coalesce(fill.item->>'id', 'fill_'||md5(random()::text||clock_timestamp()::text)) as id,
  cto.id as calculator_trade_order_id,
  coalesce(nullif(fill.item->>'time', '')::timestamptz, now()) as filled_at,
  (fill.item->>'price')::numeric,
  (fill.item->>'qty')::numeric,
  (fill.item->>'fee')::numeric
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
cross join lateral jsonb_array_elements(coalesce(p.value->'calculatorTrades', '[]'::jsonb)) as ct(value)
cross join lateral jsonb_array_elements(coalesce(ct.value->'orders', '[]'::jsonb)) with ordinality as ord(item, idx)
join public.calculator_trade_orders cto
  on cto.calculator_trade_id = ct.value->>'id'
 and cto.line_no = (ord.idx + 1)
cross join lateral jsonb_array_elements(coalesce(ord.item->'fills', '[]'::jsonb)) as fill(item)
where p.key <> 'guest'
on conflict (id) do nothing;

-- 4) Journal trades
insert into public.journal_trades (
  id, profile_id, source_calc_id, title, symbol, timeframe, direction,
  setup_confirmed_at, open_time, full_exit_time, entry_qty, total_qty,
  avg_entry, sl, entry_fees, tp_scheme, tp_targets, status, chart_link, selected_slot
)
select
  jt.value->>'id' as id,
  up.id as profile_id,
  jt.value->>'sourceCalcId' as source_calc_id,
  coalesce(jt.value->>'title', '(ohne Titel)') as title,
  coalesce(jt.value->>'symbol', 'UNKNOWN') as symbol,
  jt.value->>'timeframe' as timeframe,
  jt.value->>'direction' as direction,
  nullif(jt.value->>'setupConfirmedAt', '')::timestamptz,
  nullif(jt.value->>'openTime', '')::timestamptz,
  nullif(jt.value->>'fullExitTime', '')::timestamptz,
  (jt.value->>'entryQty')::numeric,
  (jt.value->>'totalQty')::numeric,
  (jt.value->>'avgEntry')::numeric,
  (jt.value->>'sl')::numeric,
  (jt.value->>'entryFees')::numeric,
  jt.value->'tpScheme',
  jt.value->'tpTargets',
  jt.value->>'status',
  jt.value->>'chartLink',
  jt.value#>>'{ui,selectedSlot}'
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
join public.user_profiles up on up.user_id = a.user_id and up.username = p.key
cross join lateral jsonb_array_elements(coalesce(p.value->'journalTrades', '[]'::jsonb)) as jt(value)
where p.key <> 'guest' and nullif(jt.value->>'id','') is not null
on conflict (id) do update
set
  source_calc_id = excluded.source_calc_id,
  title = excluded.title,
  symbol = excluded.symbol,
  timeframe = excluded.timeframe,
  direction = excluded.direction,
  setup_confirmed_at = excluded.setup_confirmed_at,
  open_time = excluded.open_time,
  full_exit_time = excluded.full_exit_time,
  entry_qty = excluded.entry_qty,
  total_qty = excluded.total_qty,
  avg_entry = excluded.avg_entry,
  sl = excluded.sl,
  entry_fees = excluded.entry_fees,
  tp_scheme = excluded.tp_scheme,
  tp_targets = excluded.tp_targets,
  status = excluded.status,
  chart_link = excluded.chart_link,
  selected_slot = excluded.selected_slot,
  updated_at = now();

-- 4a) Journal exits
insert into public.journal_trade_exits (id, journal_trade_id, slot, exit_time, qty, price, fee, pnl_gross)
select
  ex.value->>'id' as id,
  jt.value->>'id' as journal_trade_id,
  coalesce(ex.value->>'slot', 'TP1') as slot,
  coalesce(nullif(ex.value->>'time', '')::timestamptz, now()) as exit_time,
  (ex.value->>'qty')::numeric,
  (ex.value->>'price')::numeric,
  (ex.value->>'fee')::numeric,
  nullif(ex.value->>'pnlGross', '')::numeric
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
cross join lateral jsonb_array_elements(coalesce(p.value->'journalTrades', '[]'::jsonb)) as jt(value)
cross join lateral jsonb_array_elements(coalesce(jt.value->'exits', '[]'::jsonb)) as ex(value)
where p.key <> 'guest' and nullif(ex.value->>'id','') is not null
on conflict (id) do update
set
  slot = excluded.slot,
  exit_time = excluded.exit_time,
  qty = excluded.qty,
  price = excluded.price,
  fee = excluded.fee,
  pnl_gross = excluded.pnl_gross;

-- 5) Tickets
insert into public.support_tickets (id, profile_id, title, type, status, created_at, updated_at)
select
  tk.value->>'id' as id,
  up.id as profile_id,
  coalesce(tk.value->>'title', '(ohne Titel)') as title,
  coalesce(tk.value->>'type', 'wish') as type,
  coalesce(tk.value->>'status', 'open') as status,
  coalesce(nullif(tk.value->>'createdAt','')::timestamptz, now()) as created_at,
  coalesce(nullif(tk.value->>'updatedAt','')::timestamptz, now()) as updated_at
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
join public.user_profiles up on up.user_id = a.user_id and up.username = p.key
cross join lateral jsonb_array_elements(coalesce(p.value->'tickets', '[]'::jsonb)) as tk(value)
where p.key <> 'guest' and nullif(tk.value->>'id','') is not null
on conflict (id) do update
set
  title = excluded.title,
  type = excluded.type,
  status = excluded.status,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.support_ticket_messages (id, ticket_id, sender, message_text, created_at)
select
  msg.value->>'id' as id,
  tk.value->>'id' as ticket_id,
  coalesce(msg.value->>'from', 'user') as sender,
  coalesce(msg.value->>'text', '') as message_text,
  coalesce(nullif(msg.value->>'createdAt','')::timestamptz, now()) as created_at
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
cross join lateral jsonb_array_elements(coalesce(p.value->'tickets', '[]'::jsonb)) as tk(value)
cross join lateral jsonb_array_elements(coalesce(tk.value->'messages', '[]'::jsonb)) as msg(value)
where p.key <> 'guest' and nullif(msg.value->>'id','') is not null
on conflict (id) do update
set
  sender = excluded.sender,
  message_text = excluded.message_text,
  created_at = excluded.created_at;

insert into public.support_ticket_attachments (message_id, file_name, mime_type, data_url)
select
  msg.value->>'id' as message_id,
  coalesce(att.value->>'name', 'attachment') as file_name,
  att.value->>'type' as mime_type,
  coalesce(att.value->>'dataUrl', '') as data_url
from public.app_data a
cross join lateral jsonb_each(coalesce(a.data->'profiles', '{}'::jsonb)) as p(key, value)
cross join lateral jsonb_array_elements(coalesce(p.value->'tickets', '[]'::jsonb)) as tk(value)
cross join lateral jsonb_array_elements(coalesce(tk.value->'messages', '[]'::jsonb)) as msg(value)
cross join lateral jsonb_array_elements(coalesce(msg.value->'attachments', '[]'::jsonb)) as att(value)
where p.key <> 'guest' and nullif(msg.value->>'id','') is not null;
