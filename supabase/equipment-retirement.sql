-- Apply to an existing BeltTrace database before deploying v4.2.5.
begin;

alter table public.equipments
  add column if not exists retired_at timestamptz;

create or replace function public.set_equipment_retired(p_equipment_id text, p_retired boolean)
returns jsonb
language plpgsql
strict
set search_path = ''
as $$
declare
  saved jsonb;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'Solo un administrador puede dar de baja o reactivar balanzas.'
      using errcode = '42501';
  end if;

  update public.equipments as equipment
    set retired_at = case when p_retired then coalesce(equipment.retired_at, now()) else null end
    where equipment.id = p_equipment_id
    returning to_jsonb(equipment) into saved;

  if not found then
    raise exception 'La balanza ya no existe.' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

revoke all on function public.set_equipment_retired(text, boolean) from public, anon, authenticated;
grant execute on function public.set_equipment_retired(text, boolean) to authenticated;

create or replace function public.check_equipment_retirement_for_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  retirement timestamptz;
begin
  if tg_op = 'UPDATE' and new.equipment_id is not distinct from old.equipment_id then
    return new;
  end if;

  select equipment.retired_at into retirement
    from public.equipments as equipment
    where equipment.id = new.equipment_id
    for share;

  -- Allow records created before retirement to arrive from the offline queue.
  if retirement is not null and (new.created_at > retirement or new.event_date > retirement) then
    raise exception 'La balanza está dada de baja. Elegí una balanza activa.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$$;

revoke all on function public.check_equipment_retirement_for_event() from public, anon, authenticated;
drop trigger if exists calibration_events_check_equipment_retirement on public.calibration_events;
create trigger calibration_events_check_equipment_retirement
before insert or update of equipment_id on public.calibration_events
for each row execute function public.check_equipment_retirement_for_event();

notify pgrst, 'reload schema';
commit;
