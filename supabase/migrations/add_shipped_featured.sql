-- Shipped projects
alter table projects add column if not exists shipped boolean default false;
alter table projects add column if not exists shipped_at timestamptz;

-- Featured projects (toggled by project owner; admin can set via Supabase dashboard)
alter table projects add column if not exists featured boolean default false;
