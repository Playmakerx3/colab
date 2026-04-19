-- Add media_type column to posts table so media posts persist their type correctly
alter table posts add column if not exists media_type text;
