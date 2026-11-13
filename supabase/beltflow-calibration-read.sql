-- Apply after BeltTrace's schema.sql. Enable integration per equipment.
begin;

create schema if not exists beltflow_private;
revoke all on schema beltflow_private from public, anon, authenticated;

create table if not exists beltflow_private.calibration_access (
  token_hash bytea not null check (octet_length(token_hash) = 32),
  equipment_id text not null references public.equipments(id) on delete cascade,
  primary key (token_hash, equipment_id)
);

revoke all on beltflow_private.calibration_access from public, anon, authenticated;

create or replace function public.beltflow_calibration_summary(p_token text, p_equipment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  frequency integer;
  summary jsonb;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[a-f0-9]+$'
     or p_equipment is null or length(p_equipment) not between 1 and 128 then
    raise sqlstate 'PT403' using message = 'Consulta de BeltTrace no autorizada';
  end if;

  select case when e.check_interval_days > 0 then e.check_interval_days else 30 end
    into frequency
    from beltflow_private.calibration_access a
    join public.equipments e on e.id = a.equipment_id
   where a.token_hash = sha256(convert_to(p_token, 'UTF8')) and a.equipment_id = p_equipment;
  if not found then
    raise sqlstate 'PT403' using message = 'Consulta de BeltTrace no autorizada';
  end if;

  with events as (
    select e.id, e.event_date, e.material_validation, e.final_adjustment,
           coalesce(final_pass.error_pct,
             case when jsonb_typeof(e.material_validation->'errorPct') = 'number'
                  then (e.material_validation->>'errorPct')::numeric end) as error_pct,
           e.tolerance_percent
    from public.calibration_events e
    left join lateral (
      select (pass->>'errorPct')::numeric as error_pct
      from jsonb_array_elements(
        case when jsonb_typeof(e.material_validation->'passes') = 'array'
             then e.material_validation->'passes' else '[]'::jsonb end
      ) with ordinality as p(pass, position)
      where case when jsonb_typeof(pass->'externalWeightKg') = 'number'
                  and jsonb_typeof(pass->'beltWeightKg') = 'number'
                  and jsonb_typeof(pass->'errorPct') = 'number'
                 then (pass->>'externalWeightKg')::numeric > 0 and (pass->>'beltWeightKg')::numeric > 0
                 else false end
      order by position desc limit 1
    ) final_pass on true
    where e.equipment_id = p_equipment
  ), outcomes as (
    select *, coalesce(material_validation->>'outcome',
       case when abs(error_pct) <= tolerance_percent then 'control_conforme' else 'fuera_tolerancia' end) as outcome,
       case when jsonb_typeof(final_adjustment->'factorBefore') = 'number'
            then (final_adjustment->>'factorBefore')::numeric end as factor_before,
       case when jsonb_typeof(final_adjustment->'factorAfter') = 'number'
            then (final_adjustment->>'factorAfter')::numeric end as factor_after
    from events
  ), latest as (
    select * from outcomes order by event_date desc, id desc limit 1
  ), valid as (
    select (event_date at time zone 'America/Argentina/Buenos_Aires')::date as day
    from outcomes where outcome in ('control_conforme', 'calibrada_ajustada')
    order by event_date desc, id desc limit 1
  ), adjustments as (
    select id, event_date, factor_before, factor_after from outcomes
    where material_validation->'adjustmentApplied' = 'true'::jsonb
      and factor_before between 0.000000001 and 1000000000
      and factor_after between 0.000000001 and 1000000000 and factor_before <> factor_after
    order by event_date desc, id desc limit 1000
  )
  select jsonb_build_object(
    'status', case when latest.outcome not in ('control_conforme', 'calibrada_ajustada', 'ajuste_sin_verificacion')
                   then 'out_of_tolerance'
                   when valid.day is null then 'no_history'
                   when valid.day + frequency < local_day.day then 'overdue'
                   when valid.day + frequency <= local_day.day + 7 then 'due_soon'
                   else 'ok' end,
    'last_check', valid.day,
    'next_check', case when latest.outcome in ('control_conforme', 'calibrada_ajustada', 'ajuste_sin_verificacion')
                       then valid.day + frequency end,
    'last_error', case when latest.error_pct between -1000000000 and 1000000000 then latest.error_pct end,
    'factor', case when latest.factor_after between 0.000000001 and 1000000000 then latest.factor_after end,
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object(
      'at', event_date, 'before', factor_before, 'after', factor_after
    ) order by event_date desc, id desc) from adjustments), '[]'::jsonb)
  ) into summary
  from (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as day) local_day
  left join latest on true
  left join valid on true;

  return summary;
end;
$$;

revoke all on function public.beltflow_calibration_summary(text, text) from public, anon, authenticated;
grant execute on function public.beltflow_calibration_summary(text, text) to anon;
notify pgrst, 'reload schema';
commit;
