-- ONLY the disposable codex-ninety-feet-db-tests database.
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222') on conflict do nothing;
