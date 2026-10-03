
create table if not exists public.mobile_portrait_trial (
 id smallint primary key check (id=1),
 owner uuid,
 attempts integer not null default 0 check (attempts between 0 and 2),
 completed boolean not null default false,
 reserved_at timestamptz
);
insert into public.mobile_portrait_trial(id) values(1) on conflict do nothing;
alter table public.mobile_portrait_trial enable row level security;
revoke all on public.mobile_portrait_trial from anon, authenticated;
grant all on public.mobile_portrait_trial to service_role;
create or replace function public.mobile_portrait_claim(p_user uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare ok boolean;
begin
 update public.mobile_portrait_trial set owner=p_user,attempts=attempts+1,reserved_at=now()
 where id=1 and owner is null and not completed and attempts<2 returning true into ok;
 return coalesce(ok,false);
end $$;
create or replace function public.mobile_portrait_finish(p_user uuid,p_success boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.mobile_portrait_trial set completed=p_success,owner=case when p_success then p_user else null end
 where id=1 and owner=p_user and not completed;
end $$;
revoke all on function public.mobile_portrait_claim(uuid), public.mobile_portrait_finish(uuid,boolean) from public, anon, authenticated;
grant execute on function public.mobile_portrait_claim(uuid), public.mobile_portrait_finish(uuid,boolean) to service_role;
