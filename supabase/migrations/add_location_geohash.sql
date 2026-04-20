alter table profiles add column if not exists location_geohash text;
alter table profiles add column if not exists location_lat double precision;
alter table profiles add column if not exists location_lng double precision;
