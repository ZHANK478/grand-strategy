-- ============================================================
-- GRAND STRATEGY — СХЕМА БАЗЫ (Supabase / Postgres)
-- Шаг 1: аккаунты, профили, баланс ходов, облачные сейвы.
-- Выполнить один раз: Supabase Dashboard → SQL Editor → вставить → Run.
-- ============================================================

-- ------------------------------------------------------------
-- profiles — по одной строке на пользователя (расширяет auth.users).
-- turns_balance — сколько «ходов» осталось (валюта игрока). Стартовый бонус — free trial.
-- plan — 'free' | 'premium' (портреты/иллюстрации включаются здесь на шаге оплаты).
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  turns_balance integer not null default 40,   -- FREE TRIAL: 40 ходов новичку
  turns_spent   integer not null default 0,    -- всего потрачено (для статистики)
  plan          text    not null default 'free',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Пользователь видит и правит ТОЛЬКО свою строку. Баланс ходов клиент менять НЕ должен —
-- его списывает серверная функция spend_turn (шаг «прокси»), поэтому update оставляем
-- только на безопасные поля через отдельную политику ниже.
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles
  for select using (auth.uid() = id);

-- ------------------------------------------------------------
-- Автосоздание профиля при регистрации нового пользователя.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- spend_turn() — АТОМАРНОЕ списание одного хода.
-- Вызывается сервером-прокси перед обращением к OpenRouter (шаг 2).
-- Возвращает новый баланс или -1, если ходов нет. security definer —
-- функция обходит RLS и является ЕДИНСТВЕННЫМ легальным способом уменьшить баланс.
-- ------------------------------------------------------------
create or replace function public.spend_turn(p_user uuid, p_cost integer default 1)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  remaining integer;
begin
  update public.profiles
     set turns_balance = turns_balance - p_cost,
         turns_spent   = turns_spent + p_cost,
         updated_at    = now()
   where id = p_user
     and turns_balance >= p_cost
  returning turns_balance into remaining;

  if remaining is null then
    return -1;               -- ходов не хватило — прокси вернёт «купи ещё»
  end if;
  return remaining;
end;
$$;

-- ------------------------------------------------------------
-- add_turns() — начисление ходов. Вызывается ТОЛЬКО вебхуком Stripe (шаг 3),
-- никогда не из браузера. security definer.
-- ------------------------------------------------------------
create or replace function public.add_turns(p_user uuid, p_amount integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  remaining integer;
begin
  update public.profiles
     set turns_balance = turns_balance + p_amount,
         updated_at    = now()
   where id = p_user
  returning turns_balance into remaining;
  return coalesce(remaining, 0);
end;
$$;

-- ------------------------------------------------------------
-- saves — облачные сейвы (профиль = партии на любом устройстве).
-- state — полный JSON состояния партии (то, что раньше уходило в localStorage).
-- ------------------------------------------------------------
create table if not exists public.saves (
  id            text not null,                 -- slot_... из игры
  user_id       uuid not null references auth.users(id) on delete cascade,
  scenario_ref  text,
  scenario_name text,
  country       text,
  ruler         text,
  turn          integer,
  year          integer,
  month         integer,
  treasury      bigint,
  state         jsonb not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.saves enable row level security;

drop policy if exists "saves own all" on public.saves;
create policy "saves own all" on public.saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists saves_user_updated on public.saves (user_id, updated_at desc);
