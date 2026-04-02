-- Project privacy and archiving
alter table projects add column if not exists is_private boolean default false;
alter table projects add column if not exists archived boolean default false;

-- Invite links
create table if not exists project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  token text unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table project_invites enable row level security;
create policy "anyone can read invites" on project_invites for select using (true);
create policy "owners can create invites" on project_invites for insert with check (auth.uid() = created_by);

-- Activity log
create table if not exists project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id),
  user_name text,
  event_type text,
  details text,
  created_at timestamptz default now()
);
alter table project_activity enable row level security;
create policy "members can view activity" on project_activity for select using (true);
create policy "members can insert activity" on project_activity for insert with check (auth.uid() = user_id);

-- GitHub repo per project
alter table projects add column if not exists github_repo text;
