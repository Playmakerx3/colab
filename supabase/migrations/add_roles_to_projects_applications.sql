-- Add open_roles array to projects so project owners can list roles they need
alter table projects add column if not exists open_roles text[] default '{}';

-- Add role column to applications so applicants can specify which role they're applying for
alter table applications add column if not exists role text;
