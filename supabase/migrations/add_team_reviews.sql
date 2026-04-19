-- Team reviews: post-project ratings between collaborators
create table if not exists team_reviews (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null,
  reviewer_id uuid not null,
  reviewee_id uuid not null,
  rating integer not null check (rating >= 0 and rating <= 5),
  created_at timestamptz default now(),
  unique(project_id, reviewer_id, reviewee_id)
);

create index if not exists team_reviews_reviewee_id_idx on team_reviews(reviewee_id);
create index if not exists team_reviews_project_id_idx on team_reviews(project_id);
create index if not exists team_reviews_reviewer_id_idx on team_reviews(reviewer_id);

-- Allow anyone to insert their own reviews
alter table team_reviews enable row level security;
create policy "Users can insert their own reviews" on team_reviews for insert with check (auth.uid() = reviewer_id);
create policy "Reviews are publicly readable" on team_reviews for select using (true);
