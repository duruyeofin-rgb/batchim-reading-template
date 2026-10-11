-- 네 단원마다 중간 평가. mission_runs.sql 적용 후 실행합니다. 이전 미션 기록은 유지합니다.
-- 기존 attempts/progress/별 기록을 이관하거나 삭제하지 않습니다.
begin;
create table if not exists public.mission_epochs (
  student_id uuid primary key references public.students(id) on delete cascade,
  epoch uuid not null default gen_random_uuid()
);
create table if not exists public.checkpoint_runs (
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  unit_id text not null check (unit_id in ('1-4','1-8','2-4')),
  epoch uuid not null,
  kind text not null check (kind in ('rescue','treasure','train')),
  reason text not null check (length(reason) <= 300),
  status text not null check (status in ('started','completed','skipped')),
  item_ids text[] not null check (cardinality(item_ids) = 4),
  results jsonb not null check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) = 4),
  revision integer not null check (revision > 0),
  started_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (student_id, unit_id)
);
create index if not exists checkpoint_runs_class_idx on public.checkpoint_runs(class_id, updated_at);
alter table public.mission_epochs enable row level security;
alter table public.checkpoint_runs enable row level security;
revoke all on public.mission_epochs, public.checkpoint_runs from anon, authenticated;
grant select on public.mission_epochs to authenticated;
grant select, insert, update on public.checkpoint_runs to authenticated;

drop policy if exists mission_epoch_read on public.mission_epochs;
create policy mission_epoch_read on public.mission_epochs for select to authenticated using (
  exists (select 1 from public.students s where s.id = mission_epochs.student_id and s.auth_uid = auth.uid())
  or exists (select 1 from public.students s join public.classes c on c.id = s.class_id where s.id = mission_epochs.student_id and c.teacher_id = auth.uid())
);
drop policy if exists mission_read on public.checkpoint_runs;
create policy mission_read on public.checkpoint_runs for select to authenticated using (
  exists (select 1 from public.students s where s.id = checkpoint_runs.student_id and s.class_id = checkpoint_runs.class_id and s.auth_uid = auth.uid())
  or exists (select 1 from public.classes c where c.id = checkpoint_runs.class_id and c.teacher_id = auth.uid())
);
drop policy if exists mission_insert on public.checkpoint_runs;
create policy mission_insert on public.checkpoint_runs for insert to authenticated with check (
  exists (select 1 from public.students s join public.mission_epochs e on e.student_id = s.id
    where s.id = checkpoint_runs.student_id and s.class_id = checkpoint_runs.class_id and s.auth_uid = auth.uid() and e.epoch = checkpoint_runs.epoch)
);
drop policy if exists mission_update on public.checkpoint_runs;
create policy mission_update on public.checkpoint_runs for update to authenticated using (
  exists (select 1 from public.students s where s.id = checkpoint_runs.student_id and s.class_id = checkpoint_runs.class_id and s.auth_uid = auth.uid())
) with check (
  exists (select 1 from public.students s join public.mission_epochs e on e.student_id = s.id
    where s.id = checkpoint_runs.student_id and s.class_id = checkpoint_runs.class_id and s.auth_uid = auth.uid() and e.epoch = checkpoint_runs.epoch)
);


-- 네 단원의 낱말·문장 완료 여부를 서버에서 검증합니다.
create or replace function public.checkpoint_units(p_unit_id text)
returns text[] language sql immutable set search_path = public as $$
 select case p_unit_id when '1-4' then array['1-1','1-2','1-3','1-4']
 when '1-8' then array['1-5','1-6','1-7','1-8']
 when '2-4' then array['2-1','2-2','2-3','2-4'] else array[]::text[] end
$$;
create or replace function public.checkpoint_eligible(p_student_id uuid, p_unit_id text)
returns boolean language sql stable security definer set search_path = public as $$
 select cardinality(public.checkpoint_units(p_unit_id)) = 4 and not exists (
   select 1 from unnest(public.checkpoint_units(p_unit_id)) u cross join unnest(array['word','sentence']) lv
   where not exists(select 1 from public.progress p where p.student_id=p_student_id and p.unit_id=u and p.level=lv and p.passed)
 )
$$;
revoke all on function public.checkpoint_units(text), public.checkpoint_eligible(uuid,text) from public, anon, authenticated;

-- 초기화와 저장은 같은 학생의 세대 행을 잠가 직렬화합니다. 오래된 기기의 재전송을 막습니다.
create or replace function public.checkpoint_context(p_student_id uuid, p_unit_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare generation uuid; saved jsonb;
begin
  if not exists(select 1 from public.students where id = p_student_id and auth_uid = auth.uid()) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.mission_epochs(student_id) values(p_student_id) on conflict do nothing;
  select epoch into generation from public.mission_epochs where student_id = p_student_id;
  select to_jsonb(r) into saved from public.checkpoint_runs r where student_id = p_student_id and unit_id = p_unit_id and epoch = generation;
  return jsonb_build_object('epoch',generation,'run',saved,'eligible',public.checkpoint_eligible(p_student_id,p_unit_id));
end $$;
revoke all on function public.checkpoint_context(uuid,text) from public, anon;
grant execute on function public.checkpoint_context(uuid,text) to authenticated;

create or replace function public.guard_checkpoint_run()
returns trigger language plpgsql security definer set search_path = public as $$
declare generation uuid; result jsonb; i integer;
begin
  select epoch into generation from public.mission_epochs where student_id = new.student_id for update;
  if not public.checkpoint_eligible(new.student_id,new.unit_id) then raise exception 'four completed units required' using errcode = 'BR001'; end if;
  if generation is null or generation <> new.epoch then raise exception 'mission reset' using errcode = 'BR001'; end if;
  if tg_op = 'UPDATE' then
    if old.epoch <> new.epoch or old.class_id <> new.class_id or old.student_id <> new.student_id or old.unit_id <> new.unit_id then raise exception 'immutable mission identity'; end if;
    if old.status <> 'started' or new.revision <= old.revision then return null; end if;
    if old.item_ids <> new.item_ids or old.kind <> new.kind or old.reason <> new.reason or old.started_at <> new.started_at then raise exception 'immutable mission questions'; end if;
  end if;
  if exists(select 1 from unnest(public.checkpoint_units(new.unit_id)) u
      where (select count(*) from unnest(new.item_ids) item where item ~ ('^' || u || '-[ws][0-9]+$')) <> 1)
    then raise exception 'one question per checkpoint unit required'; end if;
  for i in 0..3 loop
    result := new.results->i;
    if (result->>'item_id') is distinct from new.item_ids[i+1]
      or jsonb_typeof(result->'hint_used') is distinct from 'boolean'
      or jsonb_typeof(result->'resolved') is distinct from 'boolean'
      or jsonb_typeof(result->'continued') is distinct from 'boolean'
      or coalesce(jsonb_typeof(result->'first_correct'),'missing') not in ('boolean','null')
      or coalesce((result->>'tries')::integer,-1) < 0 then raise exception 'invalid mission result'; end if;
    if (result->>'resolved')::boolean and (result->>'tries')::integer < 1 then raise exception 'answer attempt required'; end if;
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
drop trigger if exists checkpoint_run_guard on public.checkpoint_runs;
create trigger checkpoint_run_guard before insert or update on public.checkpoint_runs for each row execute function public.guard_checkpoint_run();

-- 기존 「문제 풀이 기록과 단원 진도」 초기화에만 연결합니다. 별이나 직업만 지울 때는 유지합니다.
create or replace function public.reset_missions_with_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.level in ('word','sentence') then
    update public.mission_epochs set epoch = gen_random_uuid() where student_id = old.student_id;
    delete from public.mission_runs where student_id = old.student_id;
    delete from public.checkpoint_runs where student_id = old.student_id;
  end if;
  return old;
end $$;
drop trigger if exists reset_student_missions on public.progress;
create trigger reset_student_missions after delete on public.progress for each row execute function public.reset_missions_with_progress();
revoke all on function public.guard_checkpoint_run(), public.reset_missions_with_progress() from public, anon, authenticated;

create table if not exists public.checkpoint_rewards (
 student_id uuid not null,
 unit_id text not null,
 epoch uuid not null,
 job text not null,
 item_id text,
 created_at timestamptz not null default now(),
 primary key(student_id,unit_id),
 foreign key(student_id,unit_id) references public.checkpoint_runs(student_id,unit_id) on delete cascade
);
alter table public.checkpoint_rewards enable row level security;
revoke all on public.checkpoint_rewards from anon, authenticated;
grant select on public.checkpoint_rewards to authenticated;
drop policy if exists checkpoint_reward_read on public.checkpoint_rewards;
create policy checkpoint_reward_read on public.checkpoint_rewards for select to authenticated using (
 exists(select 1 from public.checkpoint_runs r where r.student_id=checkpoint_rewards.student_id and r.unit_id=checkpoint_rewards.unit_id)
);

-- 학생·초기화 세대를 잠근 뒤 한 번만 지급합니다. 클라이언트는 도구 ID를 지정할 수 없습니다.
create or replace function public.claim_checkpoint_reward(p_student_id uuid,p_unit_id text,p_epoch uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pupil public.students; reward public.checkpoint_rewards; generation uuid; tool text;
 tool_indices jsonb := '{"doctor":[0,3,4],"nurse":[0,3,4],"firefighter":[1,2,4],"police":[0,2,4],"chef":[0,2,4],"baker":[4,3,1],"scientist":[0,1,3],"teacher":[0,2,4],"painter":[0,1,4],"athlete":[0,3,4],"astronaut":[0,1,2],"farmer":[1,2,0],"vet":[0,2,4],"pilot":[3,2,1],"architect":[0,4,3],"singer":[0,2,4],"librarian":[0,2,1],"postman":[0,1,4],"hairdresser":[0,1,2],"photographer":[0,1,4],"webtoon":[0,2,4],"programmer":[0,2,3],"roboticist":[1,2,3],"busdriver":[0,3,2],"dentist":[1,0,3],"pharmacist":[0,3,2],"fisher":[1,3,4],"carpenter":[1,2,4],"zookeeper":[0,3,2]}'::jsonb;
begin
 if not exists(select 1 from public.students where id=p_student_id and auth_uid=auth.uid()) then
   raise exception 'not allowed' using errcode='42501'; end if;
 select epoch into generation from public.mission_epochs where student_id=p_student_id for update;
 if generation is null or generation <> p_epoch then raise exception 'mission reset' using errcode = 'BR001'; end if;
 select * into pupil from public.students where id=p_student_id for update;
 if not public.checkpoint_eligible(p_student_id,p_unit_id) or not exists(
   select 1 from public.checkpoint_runs where student_id=p_student_id and unit_id=p_unit_id and epoch=p_epoch and status='completed'
 ) then raise exception 'completed checkpoint required' using errcode='42501'; end if;
 select * into reward from public.checkpoint_rewards where student_id=p_student_id and unit_id=p_unit_id;
 if not found then
   if pupil.job is null or not (tool_indices ? pupil.job) then raise exception 'choose a job first'; end if;
   select pupil.job || '-tool-' || value into tool
     from jsonb_array_elements_text(tool_indices->pupil.job) with ordinality
     where not ((pupil.job || '-tool-' || value) = any(pupil.items)) order by ordinality limit 1;
   insert into public.checkpoint_rewards(student_id,unit_id,epoch,job,item_id)
     values(p_student_id,p_unit_id,p_epoch,pupil.job,tool) returning * into reward;
   if tool is not null then
     update public.students set items=array_append(items,tool),updated_at=now() where id=p_student_id returning * into pupil;
   end if;
 end if;
 return jsonb_build_object('item_id',reward.item_id,'job',reward.job,'student',to_jsonb(pupil));
end $$;
revoke all on function public.claim_checkpoint_reward(uuid,text,uuid) from public,anon;
grant execute on function public.claim_checkpoint_reward(uuid,text,uuid) to authenticated;

commit;
