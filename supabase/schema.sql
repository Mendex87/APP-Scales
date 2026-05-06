create table if not exists public.equipments (
  id text primary key,
  plant text not null default '',
  line text not null default '',
  belt_code text not null default '',
  scale_name text not null default '',
  controller_model text not null default '',
  controller_serial text not null default '',
  belt_width_mm double precision not null default 0,
  belt_length_m double precision not null default 0,
  nominal_capacity_tph double precision not null default 0,
  bridge_length_m double precision not null default 0,
  nominal_speed_ms double precision not null default 0,
  speed_source text not null default 'automatica',
  rpm_roll_diameter_mm double precision not null default 0,
  calibration_factor_current double precision not null default 0,
  adjustment_factor_current double precision not null default 1,
totalizer_unit text not null default 'tn',
  check_interval_days integer not null default 30,
  photo_path text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '',
  role text not null,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'tecnico', 'supervisor', 'viewer'));

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null default '',
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  ip_address text,
  user_agent text
);

alter table public.user_sessions enable row level security;

drop policy if exists "admin read user_sessions" on public.user_sessions;
drop policy if exists "authenticated insert user_sessions" on public.user_sessions;
drop policy if exists "authenticated update user_sessions" on public.user_sessions;
drop policy if exists "admin delete user_sessions" on public.user_sessions;

create policy "admin read user_sessions"
on public.user_sessions for select
to authenticated
using (public.current_user_role() = 'admin');

create policy "authenticated insert user_sessions"
on public.user_sessions for insert
to authenticated
with check (true);

create policy "authenticated update user_sessions"
on public.user_sessions for update
to authenticated
using (true);

create policy "admin delete user_sessions"
on public.user_sessions for delete
to authenticated
using (public.current_user_role() = 'admin');

create table if not exists public.chains (
  id text primary key,
  plant text not null default '',
  name text not null default '',
  linear_weight_kg_m double precision not null default 0,
  total_length_m double precision not null default 0,
  total_weight_kg double precision not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.calibration_events (
  id text primary key,
  equipment_id text not null,
  created_at timestamptz not null default now(),
  event_date timestamptz not null,
  tolerance_percent double precision not null default 1,
  precheck jsonb not null default '{}'::jsonb,
  zero_check jsonb not null default '{}'::jsonb,
  parameter_snapshot jsonb not null,
  chain_span jsonb not null,
  accumulated_check jsonb not null default '{}'::jsonb,
  material_validation jsonb not null,
  final_adjustment jsonb not null,
  approval jsonb not null,
  diagnosis text not null default '',
  notes text not null default '',
  sync_status text not null default 'pendiente',
  sync_message text not null default '',
  synced_at timestamptz,
  constraint calibration_events_sync_status_check
    check (sync_status in ('pendiente', 'sincronizado', 'error')),
  constraint calibration_events_equipment_id_fkey
    foreign key (equipment_id)
    references public.equipments (id)
    on delete restrict
);

create index if not exists calibration_events_equipment_id_idx
  on public.calibration_events (equipment_id);

create index if not exists calibration_events_event_date_idx
  on public.calibration_events (event_date desc);

alter table public.calibration_events
  add column if not exists precheck jsonb not null default '{}'::jsonb;

alter table public.calibration_events
  add column if not exists zero_check jsonb not null default '{}'::jsonb;

alter table public.calibration_events
  add column if not exists accumulated_check jsonb not null default '{}'::jsonb;

alter table public.calibration_events
  add column if not exists diagnosis text not null default '';

alter table public.equipments
  add column if not exists calibration_factor_current double precision not null default 0;

alter table public.equipments
  add column if not exists adjustment_factor_current double precision not null default 1;

alter table public.equipments
  add column if not exists totalizer_unit text not null default 'tn';

alter table public.equipments
  add column if not exists photo_path text not null default '';

alter table public.equipments
  add column if not exists check_interval_days integer not null default 30;

insert into storage.buckets (id, name, public)
values ('equipment-photos', 'equipment-photos', true)
on conflict (id) do update set public = true;

alter table public.chains enable row level security;

alter table public.profiles enable row level security;
alter table public.equipments enable row level security;
alter table public.calibration_events enable row level security;

drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "profiles admin read" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
drop policy if exists "equipment photos read" on storage.objects;
drop policy if exists "equipment photos write" on storage.objects;

drop policy if exists "public read equipments" on public.equipments;
drop policy if exists "public insert equipments" on public.equipments;
drop policy if exists "public update equipments" on public.equipments;
drop policy if exists "public delete equipments" on public.equipments;
drop policy if exists "public read chains" on public.chains;
drop policy if exists "public insert chains" on public.chains;
drop policy if exists "public update chains" on public.chains;
drop policy if exists "public delete chains" on public.chains;
drop policy if exists "public read calibration_events" on public.calibration_events;
drop policy if exists "public insert calibration_events" on public.calibration_events;
drop policy if exists "public update calibration_events" on public.calibration_events;
drop policy if exists "public delete calibration_events" on public.calibration_events;

create policy "public read equipments"
on public.equipments for select
to authenticated
using (true);

create policy "public insert equipments"
on public.equipments for insert
to authenticated
with check (public.current_user_role() in ('admin', 'tecnico'));

create policy "public update equipments"
on public.equipments for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "public delete equipments"
on public.equipments for delete
to authenticated
using (public.current_user_role() = 'admin');

create policy "public read chains"
on public.chains for select
to authenticated
using (true);

create policy "public insert chains"
on public.chains for insert
to authenticated
with check (public.current_user_role() in ('admin', 'tecnico'));

create policy "public update chains"
on public.chains for update
to authenticated
using (public.current_user_role() in ('admin', 'tecnico'))
with check (public.current_user_role() in ('admin', 'tecnico'));

create policy "public delete chains"
on public.chains for delete
to authenticated
using (public.current_user_role() = 'admin');

create policy "public read calibration_events"
on public.calibration_events for select
to authenticated
using (true);

create policy "public insert calibration_events"
on public.calibration_events for insert
to authenticated
with check (public.current_user_role() in ('admin', 'tecnico'));

create policy "public update calibration_events"
on public.calibration_events for update
to authenticated
using (public.current_user_role() in ('admin', 'tecnico'))
with check (public.current_user_role() in ('admin', 'tecnico'));

create policy "public delete calibration_events"
on public.calibration_events for delete
to authenticated
using (public.current_user_role() = 'admin');

create policy "profiles read own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles admin read"
on public.profiles for select
to authenticated
using (public.current_user_role() = 'admin');

create policy "profiles admin write"
on public.profiles for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "equipment photos read"
on storage.objects for select
to authenticated
using (bucket_id = 'equipment-photos');

create policy "equipment photos write"
on storage.objects for all
to authenticated
using (bucket_id = 'equipment-photos' and public.current_user_role() in ('admin', 'tecnico'))
with check (bucket_id = 'equipment-photos' and public.current_user_role() in ('admin', 'tecnico'));
