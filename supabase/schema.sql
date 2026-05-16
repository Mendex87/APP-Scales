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

create table if not exists public.plant_map_points (
  id text primary key,
  label text not null default '',
  zone text not null default '',
  point_type text not null default 'belt_scale',
  x double precision not null default 50,
  y double precision not null default 50,
  equipment_id text references public.equipments (id) on delete set null,
  object_id text not null default '',
  annual_calibration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plant_map_points_type_check
    check (point_type in ('belt_scale', 'kiln_scale', 'dispatch_scale', 'truck_scale')),
  constraint plant_map_points_x_check
    check (x >= 0 and x <= 100),
  constraint plant_map_points_y_check
    check (y >= 0 and y <= 100)
);

create index if not exists plant_map_points_equipment_id_idx
  on public.plant_map_points (equipment_id);

alter table public.plant_map_points
  add column if not exists object_id text not null default '';

create index if not exists plant_map_points_object_id_idx
  on public.plant_map_points (object_id);

insert into public.plant_map_points (id, label, zone, point_type, x, y, object_id)
values
  ('cinta-23', 'Cinta 23', 'Transporte principal', 'belt_scale', 30, 57, 'belt-cinta-23'),
  ('horno-1', 'Horno 1', 'Secado', 'kiln_scale', 36, 40, 'kiln-1'),
  ('horno-2', 'Horno 2', 'Secado', 'kiln_scale', 47, 37, 'kiln-2'),
  ('horno-3', 'Horno 3', 'Secado', 'kiln_scale', 58, 34, 'kiln-3'),
  ('despacho-1', 'Despacho 1', 'Despacho', 'dispatch_scale', 68, 57, 'dispatch-1'),
  ('despacho-2', 'Despacho 2', 'Despacho', 'dispatch_scale', 75, 53, 'dispatch-2'),
  ('despacho-3', 'Despacho 3', 'Despacho', 'dispatch_scale', 82, 49, 'dispatch-3'),
  ('despacho-4', 'Despacho 4', 'Despacho', 'dispatch_scale', 89, 45, 'dispatch-4'),
  ('bascula-1', 'Báscula 1', 'Ingreso camiones', 'truck_scale', 66, 78, 'truck-scale-1'),
  ('bascula-2', 'Báscula 2', 'Egreso camiones', 'truck_scale', 78, 82, 'truck-scale-2')
on conflict (id) do nothing;

update public.plant_map_points
set object_id = seed.object_id
from (values
  ('cinta-23', 'belt-cinta-23'),
  ('horno-1', 'kiln-1'),
  ('horno-2', 'kiln-2'),
  ('horno-3', 'kiln-3'),
  ('despacho-1', 'dispatch-1'),
  ('despacho-2', 'dispatch-2'),
  ('despacho-3', 'dispatch-3'),
  ('despacho-4', 'dispatch-4'),
  ('bascula-1', 'truck-scale-1'),
  ('bascula-2', 'truck-scale-2')
) as seed(id, object_id)
where public.plant_map_points.id = seed.id
  and public.plant_map_points.object_id = '';

create table if not exists public.plant_map_objects (
  id text primary key,
  label text not null default '',
  object_type text not null default 'structure',
  x double precision not null default 0,
  z double precision not null default 0,
  elevation double precision not null default 0,
  rotation_y double precision not null default 0,
  scale double precision not null default 1,
  width double precision not null default 1,
  depth double precision not null default 1,
  height double precision not null default 1,
  slope double precision not null default 0,
  color text not null default '#aeb6b4',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plant_map_objects_type_check
    check (object_type in ('stockpile', 'belt', 'kiln', 'structure', 'cabin', 'silo', 'dispatch_bin', 'truck_scale', 'block', 'rectangular_silo', 'rectangular_hopper', 'belt_horizontal', 'belt_inclined', 'dispatch_belt', 'truck', 'yard', 'floor', 'zone', 'marker')),
  constraint plant_map_objects_x_check
    check (x >= -18 and x <= 18),
  constraint plant_map_objects_z_check
    check (z >= -18 and z <= 18),
  constraint plant_map_objects_elevation_check
    check (elevation >= -1 and elevation <= 8),
  constraint plant_map_objects_scale_check
    check (scale >= 0.25 and scale <= 3),
  constraint plant_map_objects_dimensions_check
    check (width >= 0.08 and width <= 50 and depth >= 0.08 and depth <= 50 and height >= 0.08 and height <= 12),
  constraint plant_map_objects_slope_check
    check (slope >= -1.2 and slope <= 1.2),
  constraint plant_map_objects_color_check
    check (color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.plant_map_objects
  add column if not exists scale double precision not null default 1;

alter table public.plant_map_objects
  add column if not exists elevation double precision not null default 0;

alter table public.plant_map_objects
  add column if not exists width double precision not null default 1;

alter table public.plant_map_objects
  add column if not exists depth double precision not null default 1;

alter table public.plant_map_objects
  add column if not exists height double precision not null default 1;

alter table public.plant_map_objects
  add column if not exists slope double precision not null default 0;

alter table public.plant_map_objects
  add column if not exists color text not null default '#aeb6b4';

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_type_check;

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_x_check;

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_z_check;

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_elevation_check;

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_scale_check;

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_dimensions_check;

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_slope_check;

alter table public.plant_map_objects
  drop constraint if exists plant_map_objects_color_check;

alter table public.plant_map_objects
  add constraint plant_map_objects_type_check
  check (object_type in ('stockpile', 'belt', 'kiln', 'structure', 'cabin', 'silo', 'dispatch_bin', 'truck_scale', 'block', 'rectangular_silo', 'rectangular_hopper', 'belt_horizontal', 'belt_inclined', 'dispatch_belt', 'truck', 'yard', 'floor', 'zone', 'marker'));

alter table public.plant_map_objects
  add constraint plant_map_objects_x_check
  check (x >= -18 and x <= 18);

alter table public.plant_map_objects
  add constraint plant_map_objects_z_check
  check (z >= -18 and z <= 18);

alter table public.plant_map_objects
  add constraint plant_map_objects_elevation_check
  check (elevation >= -1 and elevation <= 8);

alter table public.plant_map_objects
  add constraint plant_map_objects_scale_check
  check (scale >= 0.25 and scale <= 3);

alter table public.plant_map_objects
  add constraint plant_map_objects_dimensions_check
  check (width >= 0.08 and width <= 50 and depth >= 0.08 and depth <= 50 and height >= 0.08 and height <= 12);

alter table public.plant_map_objects
  add constraint plant_map_objects_slope_check
  check (slope >= -1.2 and slope <= 1.2);

alter table public.plant_map_objects
  add constraint plant_map_objects_color_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');

insert into public.plant_map_objects (id, label, object_type, x, z, elevation, rotation_y, scale, width, depth, height, slope, color)
values
  ('floor-main', 'Piso planta', 'floor', 0, 0, -0.09, 0, 1, 35, 24, 0.18, 0, '#d6d2c8'),
  ('zone-stock', 'Zona acopios', 'zone', -7.3, -1.6, 0.03, 0, 1, 5.7, 4.8, 0.05, 0, '#c98500'),
  ('zone-process', 'Zona proceso', 'zone', -1.6, -1.8, 0.03, 0, 1, 8, 5.6, 0.05, 0, '#ff5949'),
  ('zone-dispatch', 'Zona despacho', 'zone', 6.3, -1.5, 0.03, 0, 1, 6.6, 5.8, 0.05, 0, '#5c9a68'),
  ('zone-truck', 'Zona camiones', 'zone', 4.8, 4.65, 0.03, 0, 1, 9.8, 2.7, 0.05, 0, '#666a70'),
  ('road-truck', 'Camino camiones', 'yard', 4.4, 4.95, 0.06, -0.12, 1, 20, 1.45, 0.06, 0, '#4b4c50'),
  ('road-service', 'Camino servicio', 'yard', -1.8, 2.95, 0.06, -0.28, 1, 19, 0.78, 0.05, 0, '#4b4c50'),
  ('road-cross', 'Camino transversal', 'yard', 7.6, 0.9, 0.06, 0.14, 1, 0.08, 17, 0.07, 0, '#4b4c50'),
  ('stockpile-wet', 'Acopio humedo', 'stockpile', -8.1, 0.55, 0, 0.5, 1, 2.7, 2.1, 1.45, 0, '#b87a32'),
  ('stockpile-washed', 'Acopio lavado', 'stockpile', -6.6, -2.2, 0, 0.5, 1, 2.7, 2.1, 1.45, 0, '#b87a32'),
  ('mcc-room', 'Sala MCC', 'cabin', -8.9, 3.05, 0, -0.12, 1, 1.35, 1, 1.25, 0, '#cbdde2'),
  ('belt-cinta-23', 'Cinta 23', 'belt', -5.3, 1.3, 0, -0.24, 1, 7.2, 0.75, 1.05, 0, '#17151a'),
  ('belt-feed', 'Alimentacion hornos', 'belt', -2.9, -0.4, 0, -0.62, 1, 5.4, 0.75, 1.65, 0.22, '#17151a'),
  ('belt-transfer', 'Transferencia a silos', 'belt', 2.9, -0.15, 0, 0.26, 1, 7.8, 0.75, 1.95, 0.18, '#17151a'),
  ('belt-dispatch', 'Cinta despacho', 'belt', 6.5, 1.35, 0, -0.18, 1, 5.4, 0.75, 1.2, 0, '#17151a'),
  ('kiln-1', 'Horno 1', 'kiln', -3.4, -2.8, 0, -0.12, 1, 4.5, 1.45, 1.5, 0, '#d85f4f'),
  ('kiln-2', 'Horno 2', 'kiln', -0.65, -3.15, 0, -0.12, 1, 4.5, 1.45, 1.5, 0, '#d85f4f'),
  ('kiln-3', 'Horno 3', 'kiln', 2.1, -3.45, 0, -0.12, 1, 4.5, 1.45, 1.5, 0, '#d85f4f'),
  ('screen-house', 'Zarandas', 'structure', -0.9, 0.9, 0, -0.16, 1, 2.65, 2.25, 1.65, 0, '#aeb6b4'),
  ('process-cabin', 'Cabina proceso', 'cabin', 1.8, 1.1, 0, -0.12, 1, 1.6, 1.05, 1.25, 0, '#cbdde2'),
  ('silo-a', 'Silo A', 'silo', 4.6, -2.65, 0, 0, 1, 1.45, 1.45, 3.8, 0, '#dfe7e1'),
  ('silo-b', 'Silo B', 'silo', 6.1, -3.05, 0, 0, 1, 1.45, 1.45, 4.3, 0, '#dfe7e1'),
  ('silo-c', 'Silo C', 'silo', 7.6, -3.18, 0, 0, 1, 1.45, 1.45, 4.1, 0, '#dfe7e1'),
  ('silo-d', 'Silo D', 'silo', 9.1, -2.8, 0, 0, 1, 1.45, 1.45, 3.5, 0, '#dfe7e1'),
  ('dispatch-1', 'Despacho 1', 'dispatch_bin', 4.6, 0.55, 0, 0, 1, 2.1, 0.85, 0.65, 0.22, '#5c9a68'),
  ('dispatch-2', 'Despacho 2', 'dispatch_bin', 6.15, 0.25, 0, 0, 1, 2.1, 0.85, 0.65, 0.22, '#5c9a68'),
  ('dispatch-3', 'Despacho 3', 'dispatch_bin', 7.7, -0.05, 0, 0, 1, 2.1, 0.85, 0.65, 0.22, '#5c9a68'),
  ('dispatch-4', 'Despacho 4', 'dispatch_bin', 9.25, 0.25, 0, 0, 1, 2.1, 0.85, 0.65, 0.22, '#5c9a68'),
  ('dispatch-cabin', 'Cabina despacho', 'cabin', 9.6, 2, 0, -0.12, 1, 1.5, 1.05, 1.25, 0, '#b8d2a7'),
  ('truck-scale-1', 'Bascula 1', 'truck_scale', 3.4, 4.55, 0, -0.12, 1, 4.5, 1.2, 0.22, 0, '#d6d2c8'),
  ('truck-scale-2', 'Bascula 2', 'truck_scale', 6.75, 5.05, 0, -0.12, 1, 4.5, 1.2, 0.22, 0, '#d6d2c8'),
  ('scale-cabin-1', 'Cabina B1', 'cabin', 1.35, 4.05, 0, -0.12, 1, 1.15, 0.9, 1.25, 0, '#d8dee8'),
  ('scale-cabin-2', 'Cabina B2', 'cabin', 9.25, 4.55, 0, -0.12, 1, 1.15, 0.9, 1.25, 0, '#d8dee8')
on conflict (id) do update
set
  elevation = excluded.elevation,
  width = excluded.width,
  depth = excluded.depth,
  height = excluded.height,
  slope = excluded.slope,
  color = excluded.color
where public.plant_map_objects.width = 1
  and public.plant_map_objects.depth = 1
  and public.plant_map_objects.height = 1
  and public.plant_map_objects.color = '#aeb6b4';

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
alter table public.plant_map_points enable row level security;
alter table public.plant_map_objects enable row level security;

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
drop policy if exists "public read plant_map_points" on public.plant_map_points;
drop policy if exists "admin insert plant_map_points" on public.plant_map_points;
drop policy if exists "admin update plant_map_points" on public.plant_map_points;
drop policy if exists "admin delete plant_map_points" on public.plant_map_points;
drop policy if exists "public read plant_map_objects" on public.plant_map_objects;
drop policy if exists "admin insert plant_map_objects" on public.plant_map_objects;
drop policy if exists "admin update plant_map_objects" on public.plant_map_objects;
drop policy if exists "admin delete plant_map_objects" on public.plant_map_objects;

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

create policy "public read plant_map_points"
on public.plant_map_points for select
to authenticated
using (true);

create policy "admin insert plant_map_points"
on public.plant_map_points for insert
to authenticated
with check (public.current_user_role() = 'admin');

create policy "admin update plant_map_points"
on public.plant_map_points for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "admin delete plant_map_points"
on public.plant_map_points for delete
to authenticated
using (public.current_user_role() = 'admin');

create policy "public read plant_map_objects"
on public.plant_map_objects for select
to authenticated
using (true);

create policy "admin insert plant_map_objects"
on public.plant_map_objects for insert
to authenticated
with check (public.current_user_role() = 'admin');

create policy "admin update plant_map_objects"
on public.plant_map_objects for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "admin delete plant_map_objects"
on public.plant_map_objects for delete
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
