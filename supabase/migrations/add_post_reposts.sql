create table public.post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);
alter table public.post_reposts enable row level security;
drop policy if exists "Users can manage own reposts" on public.post_reposts;
create policy "Users can read own reposts"
on public.post_reposts
for select
using (auth.uid() = user_id);
create policy "Users can insert own reposts"
on public.post_reposts
for insert
with check (auth.uid() = user_id);
create policy "Users can delete own reposts"
on public.post_reposts
for delete
using (auth.uid() = user_id);
