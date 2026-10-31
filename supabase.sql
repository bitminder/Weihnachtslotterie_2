create table if not exists public.lottery2_assignments (
  giver text primary key,
  recipient text not null unique,
  has_drawn boolean not null default false,
  drawn_at timestamptz
);

create table if not exists public.lottery2_meta (
  id integer primary key check (id = 1),
  round_version integer not null default 1
);

alter table public.lottery2_assignments enable row level security;
alter table public.lottery2_meta enable row level security;

revoke all on table public.lottery2_assignments from anon, authenticated;
revoke all on table public.lottery2_meta from anon, authenticated;

insert into public.lottery2_meta(id, round_version)
values (1, 1)
on conflict (id) do nothing;

create or replace function public.lottery2_status()
returns table(drawn_count integer, total_count integer, round_version integer)
language sql
security definer
set search_path = ''
as $$
  select
    count(*) filter (where a.has_drawn)::integer,
    count(*)::integer,
    (select m.round_version from public.lottery2_meta m where m.id = 1)
  from public.lottery2_assignments a;
$$;

create or replace function public.lottery2_draw(p_giver text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if p_giver is null or not (
    p_giver = any(array['Davor','Claudia','Anna-Marie','Nicolina','Alexander','Dominik']::text[])
  ) then
    raise exception 'Ungültiger Teilnehmer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20261225);

  select recipient into result
  from public.lottery2_assignments
  where giver = p_giver
  for update;

  if result is null then
    raise exception 'Ziehung nicht verfügbar';
  end if;

  if exists (
    select 1 from public.lottery2_assignments
    where giver = p_giver and has_drawn
  ) then
    raise exception 'Für diese Person wurde bereits gezogen';
  end if;

  update public.lottery2_assignments
  set has_drawn = true,
      drawn_at = pg_catalog.now()
  where giver = p_giver
    and has_drawn = false;

  if not found then
    raise exception 'Für diese Person wurde bereits gezogen';
  end if;

  return result;
end;
$$;

create or replace function public.lottery2_reset()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  people text[] := array['Davor','Claudia','Anna-Marie','Nicolina','Alexander','Dominik'];
  shuffled text[];
  i integer;
  tries integer := 0;
  new_version integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261225);

  loop
    tries := tries + 1;

    select pg_catalog.array_agg(x order by pg_catalog.random())
    into shuffled
    from pg_catalog.unnest(people) x;

    exit when not exists (
      select 1
      from pg_catalog.generate_subscripts(people,1) s
      where people[s] = shuffled[s]
    );

    if tries > 1000 then
      raise exception 'Keine gültige Ziehung erzeugt';
    end if;
  end loop;

  delete from public.lottery2_assignments;

  for i in 1..pg_catalog.array_length(people,1) loop
    insert into public.lottery2_assignments(giver, recipient, has_drawn)
    values(people[i], shuffled[i], false);
  end loop;

  update public.lottery2_meta
  set round_version = round_version + 1
  where id = 1
  returning round_version into new_version;

  return new_version;
end;
$$;

revoke execute on function public.lottery2_status() from public, authenticated;
revoke execute on function public.lottery2_draw(text) from public, authenticated;
revoke execute on function public.lottery2_reset() from public, anon, authenticated;

grant execute on function public.lottery2_status() to anon;
grant execute on function public.lottery2_draw(text) to anon;

select public.lottery2_reset();
