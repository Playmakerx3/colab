create table if not exists activation_daily_qa_results (
  id uuid primary key default gen_random_uuid(),
  qa_date date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null check (status in ('pass', 'fail')),
  failure_reasons jsonb not null default '[]'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  alert_stub_triggered boolean not null default false,
  alert_stub_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activation_daily_qa_results_date_idx
  on activation_daily_qa_results (qa_date desc, created_at desc);

create table if not exists activation_qa_alert_log (
  id uuid primary key default gen_random_uuid(),
  qa_result_id uuid not null references activation_daily_qa_results(id) on delete cascade,
  alert_type text not null default 'notification_hook_stub',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activation_qa_alert_log_result_idx
  on activation_qa_alert_log (qa_result_id, created_at desc);

alter table activation_daily_qa_results enable row level security;
alter table activation_qa_alert_log enable row level security;

drop policy if exists "authenticated can read activation daily qa results" on activation_daily_qa_results;
create policy "authenticated can read activation daily qa results"
  on activation_daily_qa_results for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated can read activation qa alert log" on activation_qa_alert_log;
create policy "authenticated can read activation qa alert log"
  on activation_qa_alert_log for select
  using (auth.role() = 'authenticated');

create or replace view activation_daily_qa_latest_v1 as
select
  r.id,
  r.qa_date,
  r.window_start,
  r.window_end,
  r.status,
  r.failure_reasons,
  r.checks,
  r.alert_stub_triggered,
  r.alert_stub_payload,
  r.created_at
from activation_daily_qa_results r
order by r.created_at desc
limit 30;

create or replace function run_activation_daily_qa_v1(
  p_qa_date date default current_date,
  p_force_failure boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result_id uuid;
  v_window_start timestamptz := date_trunc('day', p_qa_date::timestamptz);
  v_window_end timestamptz := date_trunc('day', (p_qa_date + 1)::timestamptz);
  v_total_events bigint := 0;
  v_total_rejections bigint := 0;
  v_rejection_rate numeric := 0;
  v_missing_stages text[] := '{}'::text[];
  v_drop_events text[] := '{}'::text[];
  v_failures jsonb := '[]'::jsonb;
  v_status text := 'pass';
  v_checks jsonb := '{}'::jsonb;
  v_alert_payload jsonb := null;
begin
  select count(*)::bigint
    into v_total_events
    from activation_events
   where created_at >= v_window_start
     and created_at < v_window_end;

  select count(*)::bigint
    into v_total_rejections
    from activation_event_rejections
   where created_at >= v_window_start
     and created_at < v_window_end;

  v_rejection_rate := case
    when v_total_events + v_total_rejections = 0 then 0
    else round((v_total_rejections::numeric / (v_total_events + v_total_rejections)::numeric) * 100, 2)
  end;

  select coalesce(array_agg(d.event_name order by d.event_name), '{}'::text[])
    into v_missing_stages
    from (
      select unnest(array[
        'signup_started',
        'signup_completed',
        'project_created',
        'first_collab_invite_sent',
        'first_collab_invite_accepted',
        'first_shared_output'
      ]) as event_name
    ) d
    left join (
      select event_name, count(*)::bigint as event_count
      from activation_events
      where created_at >= v_window_start
        and created_at < v_window_end
      group by event_name
    ) c on c.event_name = d.event_name
    where coalesce(c.event_count, 0) = 0;

  with day_counts as (
    select
      event_name,
      date_trunc('day', created_at)::date as event_day,
      count(*)::numeric as cnt
    from activation_events
    where created_at >= (v_window_start - interval '7 day')
      and created_at < v_window_end
    group by event_name, date_trunc('day', created_at)::date
  ),
  baseline as (
    select
      event_name,
      avg(cnt) filter (where event_day >= (p_qa_date - 7) and event_day < p_qa_date) as baseline_avg,
      max(cnt) filter (where event_day = p_qa_date) as today_count
    from day_counts
    group by event_name
  )
  select coalesce(array_agg(event_name order by event_name), '{}'::text[])
    into v_drop_events
  from baseline
  where coalesce(baseline_avg, 0) >= 3
    and coalesce(today_count, 0) <= baseline_avg * 0.5;

  if array_length(v_missing_stages, 1) is not null then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object(
        'check', 'missing_critical_stages',
        'message', 'One or more required stages had zero events in the QA window.',
        'details', to_jsonb(v_missing_stages)
      )
    );
  end if;

  if v_rejection_rate > 5 then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object(
        'check', 'malformed_event_rate',
        'message', 'Malformed/rejected activation event rate exceeded threshold (5%).',
        'details', jsonb_build_object(
          'rate_pct', v_rejection_rate,
          'rejections', v_total_rejections,
          'accepted_events', v_total_events
        )
      )
    );
  end if;

  if array_length(v_drop_events, 1) is not null then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object(
        'check', 'sudden_drop_detection',
        'message', 'One or more stages dropped by at least 50% versus trailing 7-day baseline.',
        'details', to_jsonb(v_drop_events)
      )
    );
  end if;

  if p_force_failure then
    v_failures := v_failures || jsonb_build_array(
      jsonb_build_object(
        'check', 'manual_negative_path_validation',
        'message', 'Forced failure for negative-path validation requested by operator.',
        'details', jsonb_build_object('forced', true)
      )
    );
  end if;

  if jsonb_array_length(v_failures) > 0 then
    v_status := 'fail';
  end if;

  v_checks := jsonb_build_object(
    'qa_date', p_qa_date,
    'window_start', v_window_start,
    'window_end', v_window_end,
    'accepted_events', v_total_events,
    'rejected_events', v_total_rejections,
    'rejection_rate_pct', v_rejection_rate,
    'missing_stages', to_jsonb(v_missing_stages),
    'drop_events', to_jsonb(v_drop_events),
    'forced_failure', p_force_failure
  );

  if v_status = 'fail' then
    v_alert_payload := jsonb_build_object(
      'channel', 'notification_hook_stub',
      'qa_date', p_qa_date,
      'status', v_status,
      'failure_reasons', v_failures,
      'created_at', now()
    );
  end if;

  insert into activation_daily_qa_results (
    qa_date,
    window_start,
    window_end,
    status,
    failure_reasons,
    checks,
    alert_stub_triggered,
    alert_stub_payload
  )
  values (
    p_qa_date,
    v_window_start,
    v_window_end,
    v_status,
    v_failures,
    v_checks,
    (v_status = 'fail'),
    v_alert_payload
  )
  returning id into v_result_id;

  if v_status = 'fail' then
    insert into activation_qa_alert_log (qa_result_id, payload)
    values (
      v_result_id,
      coalesce(v_alert_payload, jsonb_build_object('channel', 'notification_hook_stub', 'qa_date', p_qa_date, 'status', v_status))
    );
  end if;

  return v_result_id;
end;
$$;

grant execute on function run_activation_daily_qa_v1(date, boolean)
  to anon, authenticated, service_role;
