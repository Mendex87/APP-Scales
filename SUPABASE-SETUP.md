# Supabase Setup

Esta app ahora usa `Supabase` como base principal de datos.

## 1. Crear proyecto

1. Entrá a `https://supabase.com`
2. Creá un proyecto nuevo
3. Copiá:
   - `Project URL`
   - `anon public key`

La URL del proyecto ya quedó preconfigurada en la app:

```text
https://qatnjksbzegltidoujms.supabase.co
```

Todavía falta cargar la `anon public key` para que la app pueda conectarse realmente.

## 2. Variables de entorno

En Vercel y en local definí:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

En local podés crear un archivo `.env.local` basado en `.env.example`.

## 3. SQL de tablas

Ejecutá este SQL en `SQL Editor` de Supabase:

También te lo dejé en archivo listo para copiar:

- `supabase/schema.sql`

```sql
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
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.calibration_events (
  id text primary key,
  equipment_id text not null,
  created_at timestamptz not null default now(),
  event_date timestamptz not null,
  tolerance_percent double precision not null default 1,
  parameter_snapshot jsonb not null,
  chain_span jsonb not null,
  material_validation jsonb not null,
  final_adjustment jsonb not null,
  approval jsonb not null,
  notes text not null default '',
  sync_status text not null default 'pendiente',
  sync_message text not null default '',
  synced_at timestamptz,
  constraint calibration_events_equipment_id_fkey
    foreign key (equipment_id)
    references public.equipments (id)
    on delete cascade
);

create index if not exists calibration_events_equipment_id_idx
  on public.calibration_events (equipment_id);

create index if not exists calibration_events_event_date_idx
  on public.calibration_events (event_date desc);
```

## 4. RLS simple para arrancar

Si querés arrancar rápido sin login todavía:

```sql
alter table public.equipments enable row level security;
alter table public.calibration_events enable row level security;

create policy "public read equipments"
on public.equipments for select
to anon
using (true);

create policy "public insert equipments"
on public.equipments for insert
to anon
with check (true);

create policy "public update equipments"
on public.equipments for update
to anon
using (true)
with check (true);

create policy "public read calibration_events"
on public.calibration_events for select
to anon
using (true);

create policy "public insert calibration_events"
on public.calibration_events for insert
to anon
with check (true);

create policy "public update calibration_events"
on public.calibration_events for update
to anon
using (true)
with check (true);
```

## 5. Relacion con Google Sheets

Supabase queda como base principal.

Google Sheets queda como:

1. tablero operativo
2. trazabilidad exportada
3. vista para supervisión

La app sigue pudiendo sincronizar eventos hacia Sheets.

## 6. Deploy en Vercel

En Vercel agregá las dos variables de entorno:

1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`

Después redeploy.

## 7. Estado esperado en la app

Cuando Supabase esté bien configurado, en la app vas a ver:

- `DB: Supabase`

Si faltan variables o falla la conexión, va a mostrar:

- `DB: Local`
