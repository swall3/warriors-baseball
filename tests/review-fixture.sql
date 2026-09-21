\set ON_ERROR_STOP on
-- Add synthetic review data ONLY to the isolated codex-ninety-feet-db-tests DB.
alter table organizations add column name text, add column short_name text, add column branding jsonb default '{}', add column active boolean default true;
alter table teams add column name text;
create table players(org_id text not null,team_id text not null,id text not null,display_name text not null,jersey_number text,active boolean default true,primary key(org_id,id),foreign key(org_id,team_id) references teams(org_id,id));
create table org_passcodes(org_id text not null,passcode_sha text not null,role text not null,active boolean default true);
insert into organizations(id,name,short_name,branding) values('org-outlaws','Warriors — local review','Warriors','{"colors":{"primary":"#0f2044"}}'),('org-review-talking','Talking Baseball — local review','Talking Baseball','{"colors":{"primary":"#1b4d3e"}}');
insert into teams(org_id,id,name) values('org-outlaws','team-review-warriors','Warriors'),('org-review-talking','team-review-talking','Talking Baseball');
insert into players(org_id,team_id,id,display_name,jersey_number)
select 'org-outlaws','team-review-warriors','review-'||i,(array['Avery','Blake','Casey','Drew','Ellis','Finley','Gray','Harper','Jamie','Kai','Logan','Morgan'])[i],i::text from generate_series(1,12) i;
insert into players(org_id,team_id,id,display_name,jersey_number)
select 'org-review-talking','team-review-talking','talking-'||i,'Player '||i,i::text from generate_series(1,12) i;
grant select on organizations,teams,players,org_passcodes to service_role;
