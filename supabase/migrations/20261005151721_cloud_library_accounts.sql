-- Optional accounts: one initial allowance, shared image cache, private cloud library.
alter table public.profiles alter column turns_balance set default 50;
alter table public.profiles add column if not exists image_generations_remaining integer not null default 5 check(image_generations_remaining between 0 and 10000);
alter table public.profiles add column if not exists trial_version integer not null default 0;
update public.profiles p set turns_balance=greatest(p.turns_balance,50-p.turns_spent),trial_version=1
from auth.users u where u.id=p.id and not coalesce(u.is_anonymous,false) and p.trial_version=0;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.profiles(id,email,turns_balance,image_generations_remaining,trial_version)
 values(new.id,new.email,case when coalesce(new.is_anonymous,false) then 0 else 50 end,case when coalesce(new.is_anonymous,false) then 0 else 5 end,1) on conflict(id) do nothing;
 return new;
end $$;
-- Linking a guest to an account also receives the allowance exactly once.
create or replace function public.account_trial_on_link() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(old.is_anonymous,false) and not coalesce(new.is_anonymous,false) then
 update public.profiles set turns_balance=greatest(turns_balance,50-turns_spent),image_generations_remaining=greatest(image_generations_remaining,5),trial_version=1,email=new.email where id=new.id;
 end if; return new;
end $$;
create trigger account_trial_linked after update of is_anonymous on auth.users for each row execute function public.account_trial_on_link();
create table public.account_turns(user_id uuid references auth.users(id) on delete cascade,request_id uuid,created_at timestamptz not null default now(),primary key(user_id,request_id));
alter table public.account_turns enable row level security;
create or replace function public.account_begin_turn(p_user uuid,p_request uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 select turns_balance into n from profiles where id=p_user for update;
 if n is null then return -1; end if;
 if exists(select 1 from account_turns where user_id=p_user and request_id=p_request) then return n; end if;
 if n<=0 then return -1; end if;
 insert into account_turns(user_id,request_id) values(p_user,p_request);
 update profiles set turns_balance=turns_balance-1,turns_spent=turns_spent+1,updated_at=now() where id=p_user returning turns_balance into n;
 return n;
end $$;
create table public.shared_images(cache_key text primary key check(length(cache_key)=64),status text not null check(status in('pending','ready')),owner_id uuid not null references auth.users(id),reservation uuid not null,guest_request uuid,asset_url text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.shared_images enable row level security;
-- The row lock protects both deduplication and the account quota under concurrency.
create or replace function public.shared_image_claim(p_user uuid,p_key text,p_guest boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r shared_images%rowtype; n integer; g jsonb; ticket uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_key,0));
 select * into r from shared_images where cache_key=p_key;
 if found then
  if r.status='ready' then return jsonb_build_object('hit',true,'url',r.asset_url); end if;
  -- An expired in-flight attempt is retained, never silently regenerated at owner's expense.
  return jsonb_build_object('error','image_busy');
 end if;
 if p_guest then
  g:=mobile_image_claim(p_user);
  if g ? 'error' then return g; end if;
  if not(g ? 'request_id') then return jsonb_build_object('error','quota_unavailable'); end if;
  n:=(g->>'remaining')::integer;
 else
  update profiles set image_generations_remaining=image_generations_remaining-1 where id=p_user and image_generations_remaining>0 returning image_generations_remaining into n;
  if n is null then return jsonb_build_object('error','no_images'); end if;
 end if;
 insert into shared_images(cache_key,status,owner_id,reservation,guest_request) values(p_key,'pending',p_user,ticket,(g->>'request_id')::uuid);
 return jsonb_build_object('reservation',ticket,'remaining',n);
end $$;
create or replace function public.shared_image_finish(p_user uuid,p_key text,p_ticket uuid,p_url text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r shared_images%rowtype;
begin
 select * into r from shared_images where cache_key=p_key and owner_id=p_user and reservation=p_ticket for update;
 if not found or r.status='ready' then return false; end if;
 if r.guest_request is not null then perform mobile_image_finish(p_user,r.guest_request,p_url is not null);
 elsif p_url is null then update profiles set image_generations_remaining=image_generations_remaining+1 where id=p_user; end if;
 if p_url is null then delete from shared_images where cache_key=p_key;
 else update shared_images set status='ready',asset_url=p_url,updated_at=now() where cache_key=p_key; end if;
 return true;
end $$;
create table public.cloud_library(user_id uuid references auth.users(id) on delete cascade,kind text not null check(kind in('map','scenario','flag','image')),id text not null,name text not null,path text not null,metadata jsonb not null default '{}',updated_at timestamptz not null default now(),primary key(user_id,kind,id));
alter table public.cloud_library enable row level security;
grant select,insert,update,delete on public.cloud_library to authenticated;
create policy library_own on public.cloud_library for all to authenticated using((select auth.uid())=user_id and (auth.jwt()->>'is_anonymous')::boolean is not true) with check((select auth.uid())=user_id and (auth.jwt()->>'is_anonymous')::boolean is not true);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('generated-images','generated-images',false,10485760,array['image/png','image/jpeg','image/webp']),('player-library','player-library',false,52428800,array['application/json','image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy player_library_read on storage.objects for select to authenticated using(bucket_id='player-library' and (auth.jwt()->>'is_anonymous')::boolean is not true and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy player_library_insert on storage.objects for insert to authenticated with check(bucket_id='player-library' and (auth.jwt()->>'is_anonymous')::boolean is not true and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy player_library_update on storage.objects for update to authenticated using(bucket_id='player-library' and (auth.jwt()->>'is_anonymous')::boolean is not true and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='player-library' and (auth.jwt()->>'is_anonymous')::boolean is not true and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy player_library_delete on storage.objects for delete to authenticated using(bucket_id='player-library' and (auth.jwt()->>'is_anonymous')::boolean is not true and (storage.foldername(name))[1]=(select auth.uid())::text);
revoke all on public.account_turns from anon,authenticated;
revoke all on public.shared_images from anon,authenticated;
grant all on public.account_turns,public.shared_images to service_role;
revoke all on function public.account_begin_turn(uuid,uuid),public.shared_image_claim(uuid,text,boolean),public.shared_image_finish(uuid,text,uuid,text),public.account_trial_on_link() from public,anon,authenticated;
grant execute on function public.account_begin_turn(uuid,uuid),public.shared_image_claim(uuid,text,boolean),public.shared_image_finish(uuid,text,uuid,text) to service_role;
