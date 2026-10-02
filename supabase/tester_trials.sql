alter table public.mobile_guest_trials add column if not exists turn_limit integer not null default 10 check(turn_limit between 10 and 100);
alter table public.mobile_guest_trials drop constraint if exists mobile_guest_trials_turns_used_check;
alter table public.mobile_guest_trials add constraint mobile_guest_trials_turns_used_check check(turns_used between 0 and 100);
alter table public.mobile_guest_trials drop constraint if exists mobile_guest_trials_requests_used_check;
alter table public.mobile_guest_trials add constraint mobile_guest_trials_requests_used_check check(requests_used between 0 and 1000);
alter table public.mobile_guest_trials drop constraint if exists mobile_guest_trials_setup_requests_check;
alter table public.mobile_guest_trials add constraint mobile_guest_trials_setup_requests_check check(setup_requests between 0 and 100);
create table if not exists public.mobile_tester_invites(token uuid primary key default gen_random_uuid(),claimed_by uuid references auth.users(id) on delete cascade);
alter table public.mobile_tester_invites enable row level security;
create or replace function public.mobile_guest_status(p_user uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into mobile_guest_trials(user_id) values(p_user) on conflict do nothing;
 select turn_limit-turns_used into n from mobile_guest_trials where user_id=p_user;
 return n;
end; $$;

create or replace function public.mobile_guest_begin(p_user uuid,p_request uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer; lim integer;
begin
 insert into mobile_guest_trials(user_id) values(p_user) on conflict do nothing;
 select turns_used,turn_limit into n,lim from mobile_guest_trials where user_id=p_user for update;
 if exists(select 1 from mobile_guest_turns where user_id=p_user and request_id=p_request) then
   return lim-n;
 end if;
 if n>=lim then return -1; end if;
 insert into mobile_guest_turns(user_id,request_id) values(p_user,p_request);
 update mobile_guest_trials set turns_used=turns_used+1 where user_id=p_user;
 return lim-n-1;
end; $$;

create or replace function public.mobile_guest_request(p_user uuid,p_turn uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; s integer; lim integer;
begin
 select requests_used,setup_requests,turn_limit into n,s,lim from mobile_guest_trials where user_id=p_user for update;
 if n is null or n>=(case when lim>10 then 1000 else 200 end) then return false; end if;
 if p_turn is null then
   if s>=(case when lim>10 then 100 else 20 end) then return false; end if;
   update mobile_guest_trials set setup_requests=setup_requests+1 where user_id=p_user;
 elsif not exists(select 1 from mobile_guest_turns where user_id=p_user and request_id=p_turn) then
   return false;
 end if;
 update mobile_guest_trials set requests_used=requests_used+1 where user_id=p_user;
 return true;
end; $$;

revoke all on function public.mobile_guest_status(uuid) from public,anon,authenticated;
revoke all on function public.mobile_guest_begin(uuid,uuid) from public,anon,authenticated;
revoke all on function public.mobile_guest_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mobile_guest_status(uuid) to service_role;
grant execute on function public.mobile_guest_begin(uuid,uuid) to service_role;
grant execute on function public.mobile_guest_request(uuid,uuid) to service_role;

create or replace function public.mobile_guest_redeem(p_user uuid,p_token uuid) returns integer language plpgsql security definer set search_path=public as $$
declare claimed uuid;
begin
 select claimed_by into claimed from mobile_tester_invites where token=p_token for update;
 if not found then return -1; end if;
 if claimed is not null and claimed<>p_user then return -1; end if;
 update mobile_tester_invites set claimed_by=p_user where token=p_token;
 insert into mobile_guest_trials(user_id) values(p_user) on conflict do nothing;
 update mobile_guest_trials set turn_limit=100 where user_id=p_user;
 return mobile_guest_status(p_user);
end; $$;
revoke all on function public.mobile_guest_redeem(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mobile_guest_redeem(uuid,uuid) to service_role;
