create table if not exists activation_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (
    event_name in (
      'signup_started',
      'signup_completed',
      'project_created',
      'first_collab_invite_sent',
      'first_collab_invite_accepted',
      'first_shared_output'
    )
  ),
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  session_id text,
  source text not null default 'web',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activation_events_event_name_created_idx
  on activation_events (event_name, created_at desc);

create index if not exists activation_events_user_created_idx
  on activation_events (user_id, created_at desc);

create unique index if not exists activation_events_first_milestone_unique
  on activation_events (user_id, event_name)
  where user_id is not null
    and event_name in (
      'signup_completed',
      'project_created',
      'first_collab_invite_sent',
      'first_collab_invite_accepted',
      'first_shared_output'
    );

create table if not exists activation_event_rejections (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table activation_events enable row level security;
alter table activation_event_rejections enable row level security;

drop policy if exists "authenticated can read activation events" on activation_events;
create policy "authenticated can read activation events"
  on activation_events for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated can read activation rejections" on activation_event_rejections;
create policy "authenticated can read activation rejections"
  on activation_event_rejections for select
  using (auth.role() = 'authenticated');

create or replace function log_activation_event_v1(
  p_event_name text,
  p_user_id uuid default null,
  p_project_id uuid default null,
  p_session_id text default null,
  p_source text default 'web',
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_reason text;
  v_rejection_logged boolean := false;
  v_payload jsonb := jsonb_build_object(
    'event_name', p_event_name,
    'user_id', p_user_id,
    'project_id', p_project_id,
    'session_id', p_session_id,
    'source', p_source,
    'context', p_context
  );
begin
  if p_event_name is null or btrim(p_event_name) = '' then
    v_reason := 'event_name is required';
  elsif p_event_name not in (
    'signup_started',
    'signup_completed',
    'project_created',
    'first_collab_invite_sent',
    'first_collab_invite_accepted',
    'first_shared_output'
  ) then
    v_reason := 'event_name is invalid';
  elsif p_context is null or jsonb_typeof(p_context) <> 'object' then
    v_reason := 'context must be a JSON object';
  elsif p_user_id is null and (p_session_id is null or btrim(p_session_id) = '') then
    v_reason := 'user_id or session_id is required';
  elsif p_event_name <> 'signup_started' and p_user_id is null then
    v_reason := 'user_id is required for this event_name';
  end if;

  if v_reason is not null then
    insert into activation_event_rejections (reason, payload)
    values (v_reason, v_payload);
    v_rejection_logged := true;
    raise exception '%', v_reason using errcode = 'P0001';
  end if;

  insert into activation_events (event_name, user_id, project_id, session_id, source, context)
  values (p_event_name, p_user_id, p_project_id, p_session_id, coalesce(nullif(btrim(p_source), ''), 'web'), coalesce(p_context, '{}'::jsonb))
  on conflict do nothing
  returning id into v_event_id;

  if v_event_id is null and p_user_id is not null then
    select id
      into v_event_id
      from activation_events
     where event_name = p_event_name
       and user_id = p_user_id
     order by created_at asc
     limit 1;
  end if;

  return v_event_id;
exception
  when others then
    if not v_rejection_logged then
      insert into activation_event_rejections (reason, payload)
      values (sqlerrm, v_payload);
    end if;
    raise;
end;
$$;

grant execute on function log_activation_event_v1(text, uuid, uuid, text, text, jsonb)
  to anon, authenticated, service_role;

create or replace view activation_funnel_v1 as
with stage_defs as (
  select 1 as stage_order, 'signup_started'::text as event_name, 'Signup started'::text as stage_label
  union all select 2, 'signup_completed', 'Signup completed'
  union all select 3, 'project_created', 'Project created'
  union all select 4, 'first_collab_invite_sent', 'First collaboration invite sent'
  union all select 5, 'first_collab_invite_accepted', 'First collaboration invite accepted'
  union all select 6, 'first_shared_output', 'First shared output'
),
stage_counts as (
  select event_name, count(*)::bigint as stage_count
  from activation_events
  group by event_name
),
ordered as (
  select
    d.stage_order,
    d.event_name,
    d.stage_label,
    coalesce(c.stage_count, 0)::bigint as stage_count
  from stage_defs d
  left join stage_counts c on c.event_name = d.event_name
  order by d.stage_order
),
baseline as (
  select greatest(
    coalesce((select stage_count::numeric from ordered where event_name = 'signup_started'), 0),
    1
  ) as signup_started_count
)
select
  o.stage_order,
  o.event_name,
  o.stage_label,
  o.stage_count,
  round((o.stage_count::numeric / b.signup_started_count) * 100, 2) as conversion_from_signup_started_pct,
  round(
    (
      o.stage_count::numeric
      / nullif(lag(o.stage_count) over (order by o.stage_order)::numeric, 0)
    ) * 100,
    2
  ) as step_to_step_conversion_pct
from ordered o
cross join baseline b
order by o.stage_order;
