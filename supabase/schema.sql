-- PrimeSession Trading - normalized Supabase schema
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------- Profiles ----------
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  email text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, username)
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  theme text not null default 'dark',
  default_timeframe text not null default '15m',
  default_leverage int not null default 10,
  default_orders int not null default 5,
  default_risk_percent numeric(8,4) not null default 0.5,
  default_scale_mode text not null default 'flat',
  show_chart_link boolean not null default false,
  tp_count int not null default 4,
  tp_percents jsonb not null default '[30,25,20,15]'::jsonb,
  runner_percent numeric(8,4) not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);

-- ---------- Calculator ----------
create table if not exists public.calculator_trades (
  id text primary key,
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  title text not null,
  symbol text not null,
  timeframe text,
  direction text not null,
  setup_confirmed_at timestamptz,
  chart_link text,
  sl numeric,
  lower_price numeric,
  upper_price numeric,
  leverage int,
  risk_percent numeric(8,4),
  balance numeric,
  mode text,
  scale_mode text,
  order_count int,
  single_entry_price numeric,
  tp_scheme jsonb,
  tp_targets jsonb,
  transferred boolean not null default false,
  journal_trade_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calculator_trade_orders (
  id uuid primary key default gen_random_uuid(),
  calculator_trade_id text not null references public.calculator_trades(id) on delete cascade,
  line_no int not null,
  plan_price numeric,
  plan_qty numeric,
  created_at timestamptz not null default now(),
  unique (calculator_trade_id, line_no)
);

create table if not exists public.calculator_trade_fills (
  id text primary key,
  calculator_trade_order_id uuid not null references public.calculator_trade_orders(id) on delete cascade,
  filled_at timestamptz not null,
  price numeric,
  qty numeric,
  fee numeric,
  created_at timestamptz not null default now()
);

-- ---------- Journal ----------
create table if not exists public.journal_trades (
  id text primary key,
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  source_calc_id text,
  title text not null,
  symbol text not null,
  timeframe text,
  direction text,
  setup_confirmed_at timestamptz,
  open_time timestamptz,
  full_exit_time timestamptz,
  entry_qty numeric,
  total_qty numeric,
  avg_entry numeric,
  sl numeric,
  entry_fees numeric,
  tp_scheme jsonb,
  tp_targets jsonb,
  status text,
  chart_link text,
  selected_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_trade_exits (
  id text primary key,
  journal_trade_id text not null references public.journal_trades(id) on delete cascade,
  slot text not null,
  exit_time timestamptz not null,
  qty numeric,
  price numeric,
  fee numeric,
  pnl_gross numeric,
  created_at timestamptz not null default now()
);

-- ---------- Tickets ----------
create table if not exists public.support_tickets (
  id text primary key,
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  title text not null,
  type text not null,
  status text not null default 'open',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.support_ticket_messages (
  id text primary key,
  ticket_id text not null references public.support_tickets(id) on delete cascade,
  sender text not null,
  message_text text not null,
  created_at timestamptz not null,
  created_at_db timestamptz not null default now()
);

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id text not null references public.support_ticket_messages(id) on delete cascade,
  file_name text not null,
  mime_type text,
  data_url text not null,
  created_at timestamptz not null default now()
);

-- ---------- Updated-at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_calculator_trades_updated_at on public.calculator_trades;
create trigger trg_calculator_trades_updated_at
before update on public.calculator_trades
for each row execute function public.set_updated_at();

drop trigger if exists trg_journal_trades_updated_at on public.journal_trades;
create trigger trg_journal_trades_updated_at
before update on public.journal_trades
for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.user_profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.calculator_trades enable row level security;
alter table public.calculator_trade_orders enable row level security;
alter table public.calculator_trade_fills enable row level security;
alter table public.journal_trades enable row level security;
alter table public.journal_trade_exits enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;

drop policy if exists up_owner_rw on public.user_profiles;
create policy up_owner_rw on public.user_profiles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists us_owner_rw on public.user_settings;
create policy us_owner_rw on public.user_settings
for all using (
  exists (
    select 1 from public.user_profiles p
    where p.id = user_settings.profile_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.user_profiles p
    where p.id = user_settings.profile_id and p.user_id = auth.uid()
  )
);

drop policy if exists ct_owner_rw on public.calculator_trades;
create policy ct_owner_rw on public.calculator_trades
for all using (
  exists (
    select 1 from public.user_profiles p
    where p.id = calculator_trades.profile_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.user_profiles p
    where p.id = calculator_trades.profile_id and p.user_id = auth.uid()
  )
);

drop policy if exists cto_owner_rw on public.calculator_trade_orders;
create policy cto_owner_rw on public.calculator_trade_orders
for all using (
  exists (
    select 1
    from public.calculator_trades ct
    join public.user_profiles p on p.id = ct.profile_id
    where ct.id = calculator_trade_orders.calculator_trade_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.calculator_trades ct
    join public.user_profiles p on p.id = ct.profile_id
    where ct.id = calculator_trade_orders.calculator_trade_id and p.user_id = auth.uid()
  )
);

drop policy if exists ctf_owner_rw on public.calculator_trade_fills;
create policy ctf_owner_rw on public.calculator_trade_fills
for all using (
  exists (
    select 1
    from public.calculator_trade_orders o
    join public.calculator_trades ct on ct.id = o.calculator_trade_id
    join public.user_profiles p on p.id = ct.profile_id
    where o.id = calculator_trade_fills.calculator_trade_order_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.calculator_trade_orders o
    join public.calculator_trades ct on ct.id = o.calculator_trade_id
    join public.user_profiles p on p.id = ct.profile_id
    where o.id = calculator_trade_fills.calculator_trade_order_id and p.user_id = auth.uid()
  )
);

drop policy if exists jt_owner_rw on public.journal_trades;
create policy jt_owner_rw on public.journal_trades
for all using (
  exists (
    select 1 from public.user_profiles p
    where p.id = journal_trades.profile_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.user_profiles p
    where p.id = journal_trades.profile_id and p.user_id = auth.uid()
  )
);

drop policy if exists jte_owner_rw on public.journal_trade_exits;
create policy jte_owner_rw on public.journal_trade_exits
for all using (
  exists (
    select 1
    from public.journal_trades jt
    join public.user_profiles p on p.id = jt.profile_id
    where jt.id = journal_trade_exits.journal_trade_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.journal_trades jt
    join public.user_profiles p on p.id = jt.profile_id
    where jt.id = journal_trade_exits.journal_trade_id and p.user_id = auth.uid()
  )
);

drop policy if exists st_owner_rw on public.support_tickets;
create policy st_owner_rw on public.support_tickets
for all using (
  exists (
    select 1 from public.user_profiles p
    where p.id = support_tickets.profile_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.user_profiles p
    where p.id = support_tickets.profile_id and p.user_id = auth.uid()
  )
);

drop policy if exists stm_owner_rw on public.support_ticket_messages;
create policy stm_owner_rw on public.support_ticket_messages
for all using (
  exists (
    select 1
    from public.support_tickets t
    join public.user_profiles p on p.id = t.profile_id
    where t.id = support_ticket_messages.ticket_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.support_tickets t
    join public.user_profiles p on p.id = t.profile_id
    where t.id = support_ticket_messages.ticket_id and p.user_id = auth.uid()
  )
);

drop policy if exists sta_owner_rw on public.support_ticket_attachments;
create policy sta_owner_rw on public.support_ticket_attachments
for all using (
  exists (
    select 1
    from public.support_ticket_messages m
    join public.support_tickets t on t.id = m.ticket_id
    join public.user_profiles p on p.id = t.profile_id
    where m.id = support_ticket_attachments.message_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.support_ticket_messages m
    join public.support_tickets t on t.id = m.ticket_id
    join public.user_profiles p on p.id = t.profile_id
    where m.id = support_ticket_attachments.message_id and p.user_id = auth.uid()
  )
);
