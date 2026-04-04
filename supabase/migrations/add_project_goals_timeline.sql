-- Adds optional planning metadata used by project creation/edit forms.
alter table projects add column if not exists goals text;
alter table projects add column if not exists timeline text;

-- Ensure PostgREST sees the new columns immediately after migration.
notify pgrst, 'reload schema';
