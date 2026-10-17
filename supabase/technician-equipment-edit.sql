-- v4.2.2: apply to the preview database before validating technician edits.
-- Re-runnable. Does not change equipment data or DELETE permissions.
begin;

alter table public.equipments
  add column if not exists check_interval_days integer not null default 30;

create or replace function public.restrict_technician_equipment_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  technical_columns text[] := array[
    'belt_code', 'controller_model', 'controller_serial', 'belt_width_mm',
    'belt_length_m', 'nominal_capacity_tph', 'bridge_length_m', 'nominal_speed_ms',
    'speed_source', 'rpm_roll_diameter_mm', 'calibration_factor_current',
    'adjustment_factor_current', 'check_interval_days', 'totalizer_unit'
  ];
begin
  if public.current_user_role() = 'tecnico'
     and (to_jsonb(new) - technical_columns) is distinct from (to_jsonb(old) - technical_columns) then
    raise exception 'El tecnico solo puede modificar parametros tecnicos y la identificacion de la cinta.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists equipments_restrict_technician_update on public.equipments;
create trigger equipments_restrict_technician_update
before update on public.equipments
for each row execute function public.restrict_technician_equipment_update();

drop policy if exists "public update equipments" on public.equipments;
create policy "public update equipments"
on public.equipments for update
to authenticated
using (public.current_user_role() in ('admin', 'tecnico'))
with check (public.current_user_role() in ('admin', 'tecnico'));

commit;
