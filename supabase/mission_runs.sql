-- 학생별 맞춤 미션. SQL Editor에서 실행합니다. (처음 설치할 때는 setup.sql에 들어 있습니다.)
-- 기존 attempts/progress/별 기록을 이관하거나 삭제하지 않습니다.
begin;
create table if not exists public.mission_epochs (
  student_id uuid primary key references public.students(id) on delete cascade,
  epoch uuid not null default gen_random_uuid()
);
create table if not exists public.mission_runs (
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  unit_id text not null check (unit_id ~ '^(1-[1-8]|2-[1-7])$'),
  epoch uuid not null,
  kind text not null check (kind in ('rescue','treasure','train')),
  reason text not null check (length(reason) <= 300),
  status text not null check (status in ('started','completed','skipped')),
  item_ids text[] not null check (cardinality(item_ids) = 3),
  results jsonb not null check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) = 3),
  revision integer not null check (revision > 0),
  started_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (student_id, unit_id)
);
create index if not exists mission_runs_class_idx on public.mission_runs(class_id, updated_at);
alter table public.mission_epochs enable row level security;
alter table public.mission_runs enable row level security;
revoke all on public.mission_epochs, public.mission_runs from anon, authenticated;
grant select on public.mission_epochs to authenticated;
grant select, insert, update on public.mission_runs to authenticated;

drop policy if exists mission_epoch_read on public.mission_epochs;
create policy mission_epoch_read on public.mission_epochs for select to authenticated using (
  exists (select 1 from public.students s where s.id = mission_epochs.student_id and s.auth_uid = auth.uid())
  or exists (select 1 from public.students s join public.classes c on c.id = s.class_id where s.id = mission_epochs.student_id and c.teacher_id = auth.uid())
);
drop policy if exists mission_read on public.mission_runs;
create policy mission_read on public.mission_runs for select to authenticated using (
  exists (select 1 from public.students s where s.id = mission_runs.student_id and s.class_id = mission_runs.class_id and s.auth_uid = auth.uid())
  or exists (select 1 from public.classes c where c.id = mission_runs.class_id and c.teacher_id = auth.uid())
);
drop policy if exists mission_insert on public.mission_runs;
create policy mission_insert on public.mission_runs for insert to authenticated with check (
  exists (select 1 from public.students s join public.mission_epochs e on e.student_id = s.id
    where s.id = mission_runs.student_id and s.class_id = mission_runs.class_id and s.auth_uid = auth.uid() and e.epoch = mission_runs.epoch)
);
drop policy if exists mission_update on public.mission_runs;
create policy mission_update on public.mission_runs for update to authenticated using (
  exists (select 1 from public.students s where s.id = mission_runs.student_id and s.class_id = mission_runs.class_id and s.auth_uid = auth.uid())
) with check (
  exists (select 1 from public.students s join public.mission_epochs e on e.student_id = s.id
    where s.id = mission_runs.student_id and s.class_id = mission_runs.class_id and s.auth_uid = auth.uid() and e.epoch = mission_runs.epoch)
);

-- 초기화와 저장은 같은 학생의 세대 행을 잠가 직렬화합니다. 오래된 기기의 재전송을 막습니다.
create or replace function public.mission_context(p_student_id uuid, p_unit_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare generation uuid; saved jsonb;
begin
  if not exists(select 1 from public.students where id = p_student_id and auth_uid = auth.uid()) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.mission_epochs(student_id) values(p_student_id) on conflict do nothing;
  select epoch into generation from public.mission_epochs where student_id = p_student_id;
  select to_jsonb(r) into saved from public.mission_runs r where student_id = p_student_id and unit_id = p_unit_id and epoch = generation;
  return jsonb_build_object('epoch',generation,'run',saved,'eligible',exists(select 1 from public.progress where student_id = p_student_id and unit_id = p_unit_id and level = 'word' and passed));
end $$;
revoke all on function public.mission_context(uuid,text) from public, anon;
grant execute on function public.mission_context(uuid,text) to authenticated;

create or replace function public.guard_mission_run()
returns trigger language plpgsql security definer set search_path = public as $$
declare generation uuid; result jsonb; i integer;
begin
  select epoch into generation from public.mission_epochs where student_id = new.student_id for update;
  if not exists(select 1 from public.progress where student_id = new.student_id and unit_id = new.unit_id and level = 'word' and passed) then raise exception 'word progress required' using errcode = 'BR001'; end if;
  if generation is null or generation <> new.epoch then raise exception 'mission reset' using errcode = 'BR001'; end if;
  if tg_op = 'UPDATE' then
    if old.epoch <> new.epoch or old.class_id <> new.class_id or old.student_id <> new.student_id or old.unit_id <> new.unit_id then raise exception 'immutable mission identity'; end if;
    if old.status <> 'started' or new.revision <= old.revision then return null; end if;
    if old.item_ids <> new.item_ids or old.kind <> new.kind or old.reason <> new.reason or old.started_at <> new.started_at then raise exception 'immutable mission questions'; end if;
  end if;
  for i in 0..2 loop
    result := new.results->i;
    if (result->>'item_id') is distinct from new.item_ids[i+1]
      or jsonb_typeof(result->'hint_used') is distinct from 'boolean'
      or jsonb_typeof(result->'resolved') is distinct from 'boolean'
      or jsonb_typeof(result->'continued') is distinct from 'boolean'
      or coalesce(jsonb_typeof(result->'first_correct'),'missing') not in ('boolean','null')
      or coalesce((result->>'tries')::integer,-1) < 0 then raise exception 'invalid mission result'; end if;
    if new.status = 'completed' and not ((result->>'resolved')::boolean or (result->>'continued')::boolean) then raise exception 'unfinished question'; end if;
    if (result->>'continued')::boolean and (result->>'tries')::integer < 3 then raise exception 'explanation requires three tries'; end if;
    if tg_op = 'UPDATE' then
      if (result->>'tries')::integer < (old.results->i->>'tries')::integer
        or (old.results->i->>'first_correct' is not null and (result->'first_correct') is distinct from (old.results->i->'first_correct'))
        or ((old.results->i->>'resolved')::boolean and not (result->>'resolved')::boolean)
        or ((old.results->i->>'hint_used')::boolean and not (result->>'hint_used')::boolean)
        or ((old.results->i->>'continued')::boolean and not (result->>'continued')::boolean) then return null; end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists mission_run_guard on public.mission_runs;
create trigger mission_run_guard before insert or update on public.mission_runs for each row execute function public.guard_mission_run();

-- 기존 「문제 풀이 기록과 단원 진도」 초기화에만 연결합니다. 별이나 직업만 지울 때는 유지합니다.
create or replace function public.reset_missions_with_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.level in ('word','sentence') then
    update public.mission_epochs set epoch = gen_random_uuid() where student_id = old.student_id;
    delete from public.mission_runs where student_id = old.student_id;
  end if;
  return old;
end $$;
drop trigger if exists reset_student_missions on public.progress;
create trigger reset_student_missions after delete on public.progress for each row execute function public.reset_missions_with_progress();
revoke all on function public.guard_mission_run(), public.reset_missions_with_progress() from public, anon, authenticated;
commit;
