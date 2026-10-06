-- Run once in Supabase SQL Editor. Anonymous sign-ins must also be enabled.
-- Existing registered profiles and their larger bonus remain unchanged.
create table if not exists public.mobile_guest_trials (
 user_id uuid primary key references auth.users(id) on delete cascade,
 turns_used integer not null default 0 check(turns_used between 0 and 10),
 requests_used integer not null default 0 check(requests_used between 0 and 200),
 setup_requests integer not null default 0 check(setup_requests between 0 and 20)
);
create table if not exists public.mobile_guest_turns (
 user_id uuid not null references public.mobile_guest_trials(user_id) on delete cascade,
 request_id uuid not null,
 primary key(user_id,request_id)
);
alter table public.mobile_guest_trials enable row level security;
alter table public.mobile_guest_turns enable row level security;

create or replace function public.mobile_guest_status(p_user uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into mobile_guest_trials(user_id) values(p_user) on conflict do nothing;
 select 10-turns_used into n from mobile_guest_trials where user_id=p_user;
 return n;
end; $$;

create or replace function public.mobile_guest_begin(p_user uuid,p_request uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into mobile_guest_trials(user_id) values(p_user) on conflict do nothing;
 select turns_used into n from mobile_guest_trials where user_id=p_user for update;
 if exists(select 1 from mobile_guest_turns where user_id=p_user and request_id=p_request) then
   return 10-n;
 end if;
 if n>=10 then return -1; end if;
 insert into mobile_guest_turns(user_id,request_id) values(p_user,p_request);
 update mobile_guest_trials set turns_used=turns_used+1 where user_id=p_user;
 return 9-n;
end; $$;

create or replace function public.mobile_guest_request(p_user uuid,p_turn uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; s integer;
begin
 select requests_used,setup_requests into n,s from mobile_guest_trials where user_id=p_user for update;
 if n is null or n>=200 then return false; end if;
 if p_turn is null then
   if s>=20 then return false; end if;
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
