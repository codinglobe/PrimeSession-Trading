-- Optional demo seed for one existing auth user.
-- Safe to run repeatedly (upsert style).

with first_user as (
  select id, email
  from auth.users
  order by created_at
  limit 1
), upsert_profile as (
  insert into public.user_profiles (user_id, username, display_name, email, is_admin)
  select
    fu.id,
    coalesce(split_part(fu.email, '@', 1), 'demo_user'),
    'Demo User',
    fu.email,
    false
  from first_user fu
  on conflict (user_id, username) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        updated_at = now()
  returning id
)
insert into public.user_settings (profile_id)
select id from upsert_profile
on conflict (profile_id) do nothing;

-- Demo calculator trade
with p as (
  select id from public.user_profiles order by created_at desc limit 1
)
insert into public.calculator_trades (
  id, profile_id, title, symbol, timeframe, direction, setup_confirmed_at,
  leverage, risk_percent, balance, mode, scale_mode, order_count
)
select
  'c_demo_001', p.id, 'BTC Breakout', 'BTCUSDT', '15m', 'long', now(),
  10, 0.5, 10000, 'scaled', 'flat', 3
from p
on conflict (id) do nothing;

insert into public.journal_trades (
  id, profile_id, source_calc_id, title, symbol, timeframe, direction,
  open_time, entry_qty, total_qty, avg_entry, sl, entry_fees, status
)
select
  'j_demo_001', p.id, 'c_demo_001', 'BTC Breakout', 'BTCUSDT', '15m', 'long',
  now(), 0.03, 0.03, 65000, 64000, 2.50, 'open'
from p
on conflict (id) do nothing;

insert into public.support_tickets (id, profile_id, title, type, status, created_at, updated_at)
select
  'tk_demo_001', p.id, 'Order-Widget Verbesserung', 'wish', 'open', now(), now()
from p
on conflict (id) do nothing;

insert into public.support_ticket_messages (id, ticket_id, sender, message_text, created_at)
values
  ('m_demo_001', 'tk_demo_001', 'user', 'Bitte eine Schnell-Auswahl für Risiko-% ergänzen.', now())
on conflict (id) do nothing;
