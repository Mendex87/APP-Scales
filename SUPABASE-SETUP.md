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

La `anon public key` también quedó integrada como valor por defecto.

Igual conviene cargar ambas variables en Vercel para que la configuración quede explícita.

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

Ese archivo ya quedó preparado para poder correrse más de una vez sin fallar por policies existentes.

Nota de mantenimiento: el bloque SQL mostrado debajo es una referencia historica resumida. Para una base actualizada usar siempre `supabase/schema.sql`, que incluye tablas de mapa 3D (`plant_map_points`, `plant_map_objects`), `model_path` para modelos `.glb` y el trigger defensivo que normaliza `plant_map_points.object_id` a texto vacio.

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
  calibration_factor_current double precision not null default 0,
  adjustment_factor_current double precision not null default 1,
  totalizer_unit text not null default 'tn',
  notes text not null default '',
  created_at timestamptz not null default now()
);

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
  constraint calibration_events_equipment_id_fkey
    foreign key (equipment_id)
    references public.equipments (id)
    on delete cascade
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
```

## 4. RLS simple para arrancar

Si querés arrancar rápido sin login todavía:

```sql
alter table public.chains enable row level security;
alter table public.equipments enable row level security;
alter table public.calibration_events enable row level security;

create policy "public read chains"
on public.chains for select
to anon
using (true);

create policy "public insert chains"
on public.chains for insert
to anon
with check (true);

create policy "public update chains"
on public.chains for update
to anon
using (true)
with check (true);

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

## 5. Exportaciones

Supabase queda como base principal. La integracion con planillas externas fue retirada del flujo operativo.

La exportacion vigente se realiza desde la app mediante reportes PDF/imprimibles por evento. Si se necesita una exportacion masiva, agregarla como CSV del historial filtrado en una preview separada.

## 6. Deploy en Vercel

En Vercel agregá las dos variables de entorno:

1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`

Después redeploy.

Valores actuales:

```text
VITE_SUPABASE_URL=https://qatnjksbzegltidoujms.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdG5qa3NiemVnbHRpZG91am1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzU1MzEsImV4cCI6MjA5MjgxMTUzMX0.Q6_AxoaJTQNvXlvjx9Kyh925VbHXntDAU8YhWaoU-Dc
```

## 7. Recuperacion de contraseña por email

La app usa el flujo nativo de Supabase Auth para recuperar contraseñas. No requiere migracion de tablas ni una Edge Function nueva, pero si requiere configurar URLs permitidas y SMTP.

### URL Configuration

En Supabase Dashboard:

1. `Authentication` > `URL Configuration`.
2. `Site URL`: usar la URL estable de produccion, por ejemplo `https://mendex87.com`.
3. `Redirect URLs`: agregar produccion y previews autorizadas.

Ejemplos:

```text
https://mendex87.com/**
https://calibracinta.mendex87.com/**
https://*.vercel.app/**
```

Para mayor control, reemplazar `https://*.vercel.app/**` por la URL exacta de la preview que se quiera probar.

### SMTP transaccional

Configurar un proveedor externo evita los limites bajos del email interno de Supabase. Proveedores validos: Resend, Brevo, SendGrid, Mailgun o Amazon SES.

Ejemplo con Resend:

```text
Host: smtp.resend.com
Port: 465
Username: resend
Password: RESEND_API_KEY
Sender email: no-reply@calibracinta.mendex87.com
Sender name: CalibraCinta
```

No versionar API keys ni contraseñas. El dominio remitente debe estar verificado en el proveedor SMTP mediante los registros DNS que indique ese proveedor.

### Template Reset Password

En `Authentication` > `Emails` > `Templates` > `Reset Password`, usar un asunto operativo y conservar siempre `{{ .ConfirmationURL }}` como link dinamico.

Asunto sugerido:

```text
Recuperá tu contraseña - CalibraCinta
```

HTML sugerido:

```html
<div style="margin:0;padding:0;background:#f0efeb;font-family:Arial,sans-serif;color:#0c0b11;">
  <div style="max-width:620px;margin:0 auto;padding:28px;">
    <div style="background:#0c0b11;color:#f8f6ef;padding:28px;border-radius:14px 14px 0 0;">
      <div style="color:#ff5949;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Acceso protegido</div>
      <h1 style="margin:10px 0 0;font-size:38px;line-height:.9;text-transform:uppercase;">CalibraCinta</h1>
      <p style="margin:14px 0 0;color:#d8d2c8;">Solicitud de recuperacion de contrasena.</p>
    </div>
    <div style="background:#fffdf8;border:1px solid #d5cfc3;border-top:0;padding:28px;border-radius:0 0 14px 14px;">
      <h2 style="margin:0 0 12px;font-size:24px;">Restablecer contrasena</h2>
      <p style="margin:0 0 18px;color:#4d494b;">Recibimos una solicitud para cambiar la contrasena de tu usuario. Si fuiste vos, usa el boton de abajo.</p>
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#ff5949;color:#0c0b11;text-decoration:none;font-weight:800;text-transform:uppercase;padding:14px 18px;border-radius:999px;">Cambiar contrasena</a>
      <p style="margin:22px 0 0;color:#6f6a68;font-size:13px;">Si no pediste este cambio, ignora este correo. Tu contrasena actual seguira igual.</p>
      <p style="margin:18px 0 0;color:#6f6a68;font-size:12px;">Si el boton no funciona, abri este enlace:<br><a href="{{ .ConfirmationURL }}" style="color:#d94135;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
    </div>
  </div>
</div>
```

### Validacion operativa

1. Entrar a la app sin sesion.
2. Usar `Olvidé mi contraseña` con un usuario real.
3. Abrir el email recibido.
4. Cargar nueva contrasena de 8 o mas caracteres.
5. Confirmar que la app vuelve al ingreso y permite iniciar sesion con la clave nueva.
6. Verificar que el boton de reenvio muestre cuenta regresiva antes de permitir otro email.

## 8. Estado esperado en la app

Cuando Supabase esté bien configurado, en la app vas a ver:

- `DB: Supabase`

Si faltan variables o falla la conexión, va a mostrar:

- `DB: Local`
