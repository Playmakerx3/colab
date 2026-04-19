-- Communities: Reddit-style topic communities for CoLab

create table if not exists communities (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  description text,
  emoji text default '💬',
  category text,
  created_by uuid,
  is_public boolean default true,
  created_at timestamptz default now()
);

create table if not exists community_members (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references communities(id) on delete cascade,
  user_id uuid not null,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(community_id, user_id)
);

create table if not exists community_posts (
  id uuid default gen_random_uuid() primary key,
  community_id uuid references communities(id) on delete cascade,
  user_id uuid not null,
  user_name text,
  user_initials text,
  title text not null,
  content text,
  upvotes integer default 0,
  comment_count integer default 0,
  created_at timestamptz default now()
);

create table if not exists community_post_votes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references community_posts(id) on delete cascade,
  user_id uuid not null,
  unique(post_id, user_id)
);

create table if not exists community_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references community_posts(id) on delete cascade,
  user_id uuid not null,
  user_name text,
  user_initials text,
  content text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists community_members_user_id_idx on community_members(user_id);
create index if not exists community_members_community_id_idx on community_members(community_id);
create index if not exists community_posts_community_id_idx on community_posts(community_id);
create index if not exists community_posts_upvotes_idx on community_posts(upvotes desc);
create index if not exists community_comments_post_id_idx on community_comments(post_id);

-- RLS
alter table communities enable row level security;
create policy "Communities are publicly readable" on communities for select using (true);
create policy "Authenticated users can create communities" on communities for insert with check (auth.uid() is not null);

alter table community_members enable row level security;
create policy "Memberships are publicly readable" on community_members for select using (true);
create policy "Users can join communities" on community_members for insert with check (auth.uid() = user_id);
create policy "Users can leave communities" on community_members for delete using (auth.uid() = user_id);

alter table community_posts enable row level security;
create policy "Community posts are publicly readable" on community_posts for select using (true);
create policy "Authenticated users can post" on community_posts for insert with check (auth.uid() = user_id);
create policy "Users can delete own posts" on community_posts for delete using (auth.uid() = user_id);
create policy "System can update post stats" on community_posts for update using (true);

alter table community_post_votes enable row level security;
create policy "Votes are publicly readable" on community_post_votes for select using (true);
create policy "Users can vote" on community_post_votes for insert with check (auth.uid() = user_id);
create policy "Users can unvote" on community_post_votes for delete using (auth.uid() = user_id);

alter table community_comments enable row level security;
create policy "Comments are publicly readable" on community_comments for select using (true);
create policy "Authenticated users can comment" on community_comments for insert with check (auth.uid() = user_id);
create policy "Users can delete own comments" on community_comments for delete using (auth.uid() = user_id);

-- Seed default communities
insert into communities (name, slug, description, emoji, category, is_public) values
  ('Music',        'music',        'For musicians, producers, beatmakers, and audio engineers',               '🎵', 'Creative',  true),
  ('Design',       'design',       'Visual design, UX, branding, and creative direction',                     '🎨', 'Creative',  true),
  ('Tech',         'tech',         'Engineering, development, devops, and all things technical',               '💻', 'Tech',      true),
  ('Startups',     'startups',     'Building companies, finding co-founders, and sharing lessons learned',     '🚀', 'Business',  true),
  ('Film & Video', 'film-video',   'Cinematography, editing, storytelling, and production',                    '🎬', 'Creative',  true),
  ('Writing',      'writing',      'Content, copywriting, journalism, and long-form storytelling',             '✍️', 'Creative',  true),
  ('Marketing',    'marketing',    'Growth, community building, branding strategy, and distribution',          '📈', 'Business',  true),
  ('Research',     'research',     'Science, data, academic work, and discovery',                              '🔬', 'Research',  true),
  ('Making',       'making',       'Hardware, fabrication, 3D printing, and hands-on creation',                '🛠️', 'Making',    true)
on conflict (slug) do nothing;
