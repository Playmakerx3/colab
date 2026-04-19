-- Persist community post downvotes
create table if not exists community_post_downvotes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references community_posts(id) on delete cascade,
  user_id uuid not null,
  unique(post_id, user_id)
);

create index if not exists community_post_downvotes_post_id_idx on community_post_downvotes(post_id);
create index if not exists community_post_downvotes_user_id_idx on community_post_downvotes(user_id);

alter table community_post_downvotes enable row level security;
create policy "Downvotes are publicly readable" on community_post_downvotes for select using (true);
create policy "Users can downvote" on community_post_downvotes for insert with check (auth.uid() = user_id);
create policy "Users can remove downvote" on community_post_downvotes for delete using (auth.uid() = user_id);
