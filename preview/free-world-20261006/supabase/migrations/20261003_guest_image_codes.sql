
create table public.mobile_image_invites (
 token uuid primary key default gen_random_uuid(),
 credits integer not null check(credits between 1 and 100),
 expires_at timestamptz not null default now()+interval '30 days',
 claimed_by uuid references auth.users(id) on delete set null,
 claimed_at timestamptz
);
create table public.mobile_image_credits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 remaining integer not null default 0 check(remaining>=0),
 spent integer not null default 0 check(spent>=0)
);
create table public.mobile_image_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'reserved' check(status in ('reserved','completed','refunded')),
 created_at timestamptz not null default now()
);
create index mobile_image_requests_user_created on public.mobile_image_requests(user_id,created_at);
alter table public.mobile_image_invites enable row level security;
alter table public.mobile_image_credits enable row level security;
alter table public.mobile_image_requests enable row level security;
revoke all on public.mobile_image_invites,public.mobile_image_credits,public.mobile_image_requests from anon,authenticated;
grant all on public.mobile_image_invites,public.mobile_image_credits,public.mobile_image_requests to service_role;
create or replace function public.mobile_image_status(p_user uuid) returns integer
language sql security definer set search_path=public,pg_temp as $$
 select coalesce((select remaining from public.mobile_image_credits where user_id=p_user),0);
$$;
create or replace function public.mobile_image_redeem(p_user uuid,p_token uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare invite public.mobile_image_invites;
begin
 if not exists(select 1 from auth.users where id=p_user and is_anonymous=true) then return -1; end if;
 select * into invite from public.mobile_image_invites where token=p_token for update;
 if not found or (invite.claimed_by is not null and invite.claimed_by<>p_user) then return -1; end if;
 if invite.claimed_by=p_user then return public.mobile_image_status(p_user); end if;
 if invite.expires_at<now() then return -1; end if;
 insert into public.mobile_image_credits(user_id,remaining) values(p_user,invite.credits)
 on conflict(user_id) do update set remaining=mobile_image_credits.remaining+excluded.remaining;
 update public.mobile_image_invites set claimed_by=p_user,claimed_at=now() where token=p_token;
 return public.mobile_image_status(p_user);
end $$;
create or replace function public.mobile_image_claim(p_user uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare credit integer; request_id uuid;
begin
 select remaining into credit from public.mobile_image_credits where user_id=p_user for update;
 if not found or credit<=0 then return jsonb_build_object('error','image_code_required'); end if;
 if exists(select 1 from public.mobile_image_requests where user_id=p_user and status='reserved') then return jsonb_build_object('error','portrait_trial_busy'); end if;
 if (select count(*) from public.mobile_image_requests where user_id=p_user and created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('error','image_rate_limit'); end if;
 update public.mobile_image_credits set remaining=remaining-1 where user_id=p_user;
 insert into public.mobile_image_requests(user_id) values(p_user) returning id into request_id;
 return jsonb_build_object('request_id',request_id,'remaining',credit-1);
end $$;
create or replace function public.mobile_image_finish(p_user uuid,p_request uuid,p_success boolean) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare request_status text;
begin
 -- Lock in the same order as claim so completion and a new claim cannot deadlock.
 perform 1 from public.mobile_image_credits where user_id=p_user for update;
 select status into request_status from public.mobile_image_requests where id=p_request and user_id=p_user for update;
 if found and request_status='reserved' then
  update public.mobile_image_requests set status=case when p_success then 'completed' else 'refunded' end where id=p_request;
  if p_success then update public.mobile_image_credits set spent=spent+1 where user_id=p_user;
  else update public.mobile_image_credits set remaining=remaining+1 where user_id=p_user; end if;
 end if;
 return public.mobile_image_status(p_user);
end $$;
-- Disable the old globally shared giveaway even for stale clients.
create or replace function public.mobile_portrait_claim(p_user uuid) returns boolean
language sql security definer set search_path=public,pg_temp as $$ select false; $$;
revoke all on function public.mobile_image_status(uuid),public.mobile_image_redeem(uuid,uuid),public.mobile_image_claim(uuid),public.mobile_image_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.mobile_image_status(uuid),public.mobile_image_redeem(uuid,uuid),public.mobile_image_claim(uuid),public.mobile_image_finish(uuid,uuid,boolean) to service_role;
