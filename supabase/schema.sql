drop view   if exists public.review_feed;
drop table  if exists public.reports  cascade;
drop table  if exists public.reviews  cascade;

create extension if not exists "uuid-ossp";

create or replace function public.student_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_student() returns boolean
language sql stable as $$
  select public.student_email() like '%@students.iiests.ac.in'
$$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null unique,
  roll        text,
  year        int,
  dept        text,
  display     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.attendance (
  student     uuid not null references public.profiles on delete cascade,
  course_code text not null,
  class_on    date not null,
  slot        text not null default '',
  status      text not null check (status in ('present', 'absent', 'cancelled')),
  updated_at  timestamptz not null default now(),
  primary key (student, course_code, class_on, slot)
);

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  student     uuid not null references public.profiles on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists push_subscriptions_student_idx
  on public.push_subscriptions (student);

create table if not exists public.club_follows (
  student    uuid not null references public.profiles on delete cascade,
  club       text not null,
  created_at timestamptz not null default now(),
  primary key (student, club)
);

create table if not exists public.push_sent (
  tag        text not null,
  endpoint   text not null,
  sent_at    timestamptz not null default now(),
  primary key (tag, endpoint)
);

create index if not exists push_sent_time_idx on public.push_sent (sent_at);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  local_part text;
  roll_part  text;
begin
  if lower(new.email) not like '%@students.iiests.ac.in' then
    raise exception 'only students.iiests.ac.in accounts may sign in';
  end if;

  local_part := split_part(lower(new.email), '@', 1);
  roll_part  := split_part(local_part, '.', 1);

  insert into public.profiles (id, email, roll, year, dept, display)
  values (
    new.id,
    lower(new.email),
    upper(roll_part),
    nullif(substring(roll_part from '^(\d{4})'), '')::int,
    upper(nullif(substring(roll_part from '^\d{4}([A-Za-z]{3})'), '')),
    initcap(coalesce(nullif(split_part(local_part, '.', 2), ''), roll_part))
  )
  on conflict (id) do update
    set email = excluded.email,
        roll  = excluded.roll,
        year  = excluded.year,
        dept  = excluded.dept;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_touch on public.attendance;
create trigger attendance_touch before update on public.attendance
  for each row execute function public.touch_updated_at();

alter table public.profiles           enable row level security;
alter table public.attendance         enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_sent          enable row level security;
alter table public.club_follows       enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles           to authenticated;
grant select, insert, update, delete on public.attendance         to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, delete         on public.club_follows       to authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid() and public.is_student());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists attendance_own on public.attendance;
create policy attendance_own on public.attendance
  for all using (student = auth.uid() and public.is_student())
  with check (student = auth.uid() and public.is_student());

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all using (student = auth.uid() and public.is_student())
  with check (student = auth.uid() and public.is_student());

drop policy if exists follows_own on public.club_follows;
create policy follows_own on public.club_follows
  for all using (student = auth.uid() and public.is_student())
  with check (student = auth.uid() and public.is_student());
