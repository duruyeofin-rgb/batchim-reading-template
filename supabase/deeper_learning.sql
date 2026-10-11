-- checkpoint_missions.sql 이후 적용. 기존 4문항 평가·보상은 보존합니다.
begin;
alter table public.checkpoint_runs drop constraint if exists checkpoint_runs_item_ids_check;
alter table public.checkpoint_runs add constraint checkpoint_runs_item_ids_check check (cardinality(item_ids) in (4,12));
alter table public.checkpoint_runs drop constraint if exists checkpoint_runs_results_check;
alter table public.checkpoint_runs add constraint checkpoint_runs_results_check check (jsonb_typeof(results)='array' and jsonb_array_length(results)=cardinality(item_ids));
create or replace function public.guard_checkpoint_run()
returns trigger language plpgsql security definer set search_path = public as $$
declare generation uuid; result jsonb; i integer; count_expected integer;
begin
  select epoch into generation from public.mission_epochs where student_id = new.student_id for update;
  if not public.checkpoint_eligible(new.student_id,new.unit_id) then raise exception 'four completed units required' using errcode = 'BR001'; end if;
  if generation is null or generation <> new.epoch then raise exception 'mission reset' using errcode = 'BR001'; end if;
  if tg_op = 'UPDATE' then
    if old.epoch <> new.epoch or old.class_id <> new.class_id or old.student_id <> new.student_id or old.unit_id <> new.unit_id then raise exception 'immutable mission identity'; end if;
    if old.status <> 'started' or new.revision <= old.revision then return null; end if;
    if old.item_ids <> new.item_ids or old.kind <> new.kind or old.reason <> new.reason or old.started_at <> new.started_at then raise exception 'immutable mission questions'; end if;
  end if;
  count_expected := cardinality(new.item_ids);
  if count_expected not in (4,12) or jsonb_array_length(new.results) <> count_expected or
     (select count(distinct item) from unnest(new.item_ids) item) <> count_expected then raise exception 'invalid question count'; end if;
  if exists(select 1 from unnest(public.checkpoint_units(new.unit_id)) u
      where (select count(*) from unnest(new.item_ids) item where item ~ ('^' || u || '-[wfs][0-9]+$')) <> count_expected/4)
    then raise exception 'balanced checkpoint units required'; end if;
  if count_expected = 12 and exists(select 1 from unnest(public.checkpoint_units(new.unit_id)) u cross join unnest(array['w','f','s']) mode
    where (select count(*) from unnest(new.item_ids) item where item ~ ('^' || u || '-' || mode || '[0-9]+$')) <> 1)
    then raise exception 'three question formats per unit required'; end if;
  if count_expected=12 and exists(select 1 from unnest(public.checkpoint_units(new.unit_id)) u where not exists(select 1 from public.learning_sessions where student_id=new.student_id and unit_id=u and kind='practice')) then raise exception 'complete deeper practice first' using errcode='42501'; end if;
  for i in 0..count_expected-1 loop
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
create table if not exists public.learning_sessions (
 id uuid primary key,
 student_id uuid not null references public.students(id) on delete cascade,
 epoch uuid not null,
 unit_id text not null,
 kind text not null check(kind in ('practice','review','story')),
 round integer not null default 0 check(round>=0),
 results jsonb not null check(jsonb_typeof(results)='array'),
 reflection text not null default '' check(length(reflection)<=300),
 created_at timestamptz not null default now()
);
create index if not exists learning_sessions_student_idx on public.learning_sessions(student_id,created_at);
create table if not exists public.learning_schedule (
 student_id uuid not null references public.students(id) on delete cascade,
 unit_id text not null check(unit_id ~ '^(1-[1-8]|2-[1-7])$'),
 anchor_on date not null,
 due_on date,
 stage integer not null default 0 check(stage between 0 and 3),
 round integer not null default 0 check(round>=0),
 weak text[] not null default '{}',
 primary key(student_id,unit_id)
);
alter table public.learning_sessions enable row level security;
alter table public.learning_schedule enable row level security;
revoke all on public.learning_sessions,public.learning_schedule from anon,authenticated;
grant select on public.learning_sessions,public.learning_schedule to authenticated;
drop policy if exists learning_sessions_read on public.learning_sessions;
create policy learning_sessions_read on public.learning_sessions for select to authenticated using (
 exists(select 1 from public.students s where s.id=student_id and s.auth_uid=auth.uid()) or
 exists(select 1 from public.students s join public.classes c on c.id=s.class_id where s.id=student_id and c.teacher_id=auth.uid())
);
drop policy if exists learning_schedule_read on public.learning_schedule;
create policy learning_schedule_read on public.learning_schedule for select to authenticated using (
 exists(select 1 from public.students s where s.id=student_id and s.auth_uid=auth.uid()) or
 exists(select 1 from public.students s join public.classes c on c.id=s.class_id where s.id=student_id and c.teacher_id=auth.uid())
);

create or replace function public.checkpoint_context(p_student_id uuid,p_unit_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare generation uuid; saved jsonb; ready boolean;
begin
 if not exists(select 1 from public.students where id=p_student_id and auth_uid=auth.uid()) then raise exception 'not allowed' using errcode='42501'; end if;
 insert into public.mission_epochs(student_id) values(p_student_id) on conflict do nothing;
 select epoch into generation from public.mission_epochs where student_id=p_student_id;
 select to_jsonb(r) into saved from public.checkpoint_runs r where student_id=p_student_id and unit_id=p_unit_id and epoch=generation;
 ready:=public.checkpoint_eligible(p_student_id,p_unit_id) and (saved is not null or not exists(select 1 from unnest(public.checkpoint_units(p_unit_id)) u where not exists(select 1 from public.learning_sessions where student_id=p_student_id and unit_id=u and kind='practice')));
 return jsonb_build_object('epoch',generation,'run',saved,'eligible',ready);
end $$;

-- 날짜는 한국 날짜. 늦게 접속해도 같은 날 복습이 연달아 열리지 않습니다.
create or replace function public.next_review(p_anchor date,p_stage integer,p_today date,p_weak boolean)
returns date language sql immutable set search_path=public as $$
 select case when p_weak then p_today+1 when p_stage>=3 then null
 else greatest(p_today+1,p_anchor+(case p_stage when 0 then 1 when 1 then 3 else 7 end)) end
$$;
revoke all on function public.next_review(date,integer,date,boolean) from public,anon,authenticated;

create or replace function public.learning_context(p_student uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare generation uuid; today date := timezone('Asia/Seoul',now())::date;
begin
 if not exists(select 1 from public.students where id=p_student and auth_uid=auth.uid()) then raise exception 'not allowed' using errcode='42501'; end if;
 insert into public.mission_epochs(student_id) values(p_student) on conflict do nothing;
 select epoch into generation from public.mission_epochs where student_id=p_student for update;
 -- 배포 전에 완료한 단원도 복습 대상에 포함하되 이전 진도는 바꾸지 않습니다.
 insert into public.learning_schedule(student_id,unit_id,anchor_on,due_on)
 select p_student,unit_id,today,today+1 from public.progress where student_id=p_student and passed and level in ('word','sentence') and unit_id ~ '^(1-[1-8]|2-[1-7])$'
 group by unit_id having count(distinct level)=2 on conflict do nothing;
 return jsonb_build_object('epoch',generation,
 'schedules',coalesce((select jsonb_agg(to_jsonb(s)-'student_id' order by due_on) from public.learning_schedule s where student_id=p_student),'[]'::jsonb),
 'practice',coalesce((select jsonb_agg(distinct unit_id) from public.learning_sessions where student_id=p_student and kind='practice'),'[]'::jsonb),
 'stories',coalesce((select jsonb_agg(distinct unit_id) from public.learning_sessions where student_id=p_student and kind='story'),'[]'::jsonb));
end $$;
revoke all on function public.learning_context(uuid) from public,anon;
grant execute on function public.learning_context(uuid) to authenticated;

create or replace function public.submit_learning(p_id uuid,p_student uuid,p_epoch uuid,p_unit text,p_kind text,p_round integer,p_results jsonb,p_reflection text default '')
returns void language plpgsql security definer set search_path=public as $$
declare generation uuid; sched public.learning_schedule; today date:=timezone('Asia/Seoul',now())::date;
 weak_keys text[]; next_stage integer; r jsonb; previous boolean; old_session public.learning_sessions;
begin
 if not exists(select 1 from public.students where id=p_student and auth_uid=auth.uid()) then raise exception 'not allowed' using errcode='42501'; end if;
 select epoch into generation from public.mission_epochs where student_id=p_student for update;
 if generation is null or generation<>p_epoch then raise exception 'learning reset' using errcode = 'BR001'; end if;
 select * into old_session from public.learning_sessions where id=p_id;
 if found then
   if old_session.student_id=p_student and old_session.epoch=p_epoch and old_session.unit_id=p_unit and old_session.kind=p_kind and old_session.round=p_round and old_session.results=p_results and old_session.reflection=p_reflection then return; end if;
   raise exception 'immutable learning submission';
 end if;
 if p_kind not in ('practice','review','story') or p_kind is null or p_round is null or p_round<0 or p_round>10000 or p_reflection is null or length(p_reflection)>300 then raise exception 'invalid learning submission'; end if;
 if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'invalid results'; end if;
 if jsonb_array_length(p_results)<>(case p_kind when 'practice' then 8 when 'review' then 6 else 3 end) then raise exception 'incomplete activity'; end if;
 for r in select value from jsonb_array_elements(p_results) loop
  if jsonb_typeof(r->'first') is distinct from 'boolean' or jsonb_typeof(r->'passed') is distinct from 'boolean' or jsonb_typeof(r->'helped') is distinct from 'boolean'
   or jsonb_typeof(r->'id') is distinct from 'string' or length(r->>'id') not between 1 and 100
   or jsonb_typeof(r->'skill') is distinct from 'string' or length(r->>'skill') not between 1 and 50 then raise exception 'invalid answer'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_results))<>jsonb_array_length(p_results) then raise exception 'duplicate answer'; end if;
 if p_kind='story' then
  if p_unit not in ('read-1-14','read-1-22','read-2-44','read-2-19','read-2-43','read-2-39','read-3-50','read-3-60','read-3-49','read-3-52','read-4-57','read-4-200','read-4-66','read-4-61','read-5-78','read-5-63','read-6-114')
   or length(trim(p_reflection))<5 or not exists(select 1 from public.progress where student_id=p_student and unit_id=p_unit and level='paragraph' and passed)
  then raise exception 'read the story first' using errcode='42501'; end if;
 else
  if p_unit !~ '^(1-[1-8]|2-[1-7])$' or (select count(distinct level) from public.progress where student_id=p_student and unit_id=p_unit and level in ('word','sentence') and passed)<>2 then raise exception 'complete unit first' using errcode='42501'; end if;
  select coalesce(array_agg(distinct value->>'skill'),'{}'::text[]) into weak_keys from jsonb_array_elements(p_results)
   where not (value->>'first')::boolean or not (value->>'passed')::boolean or (value->>'helped')::boolean;
  select * into sched from public.learning_schedule where student_id=p_student and unit_id=p_unit for update;
  if p_kind='review' then
   if sched.student_id is null or sched.due_on is null or sched.due_on>today or sched.round<>p_round then raise exception 'review not due or already completed' using errcode = 'BR001'; end if;
   next_stage := case when cardinality(weak_keys)>0 then least(sched.stage,2) else least(sched.stage+1,3) end;
   update public.learning_schedule set stage=next_stage, round=round+1,weak=weak_keys,due_on=public.next_review(anchor_on,next_stage,today,cardinality(weak_keys)>0) where student_id=p_student and unit_id=p_unit;
  else
   select exists(select 1 from public.learning_sessions where student_id=p_student and unit_id=p_unit and kind='practice') into previous;
   if not previous then
    insert into public.learning_schedule(student_id,unit_id,anchor_on,due_on,weak) values(p_student,p_unit,today,today+1,weak_keys)
    on conflict(student_id,unit_id) do update set weak=excluded.weak,due_on=case when cardinality(excluded.weak)>0 then least(coalesce(learning_schedule.due_on,today+1),today+1) else learning_schedule.due_on end;
   end if;
  end if;
 end if;
 insert into public.learning_sessions(id,student_id,epoch,unit_id,kind,round,results,reflection) values(p_id,p_student,p_epoch,p_unit,p_kind,p_round,p_results,p_reflection);
end $$;
revoke all on function public.submit_learning(uuid,uuid,uuid,text,text,integer,jsonb,text) from public,anon;
grant execute on function public.submit_learning(uuid,uuid,uuid,text,text,integer,jsonb,text) to authenticated;

-- 평가 완료와 복습 일정 반영은 같은 트랜잭션. 기기 재접속으로 일정이 중복 변경되지 않습니다.
create or replace function public.checkpoint_review_schedule()
returns trigger language plpgsql security definer set search_path=public as $$
declare u text; weak_keys text[]; today date:=timezone('Asia/Seoul',now())::date;
begin
 if new.status<>'completed' or (tg_op='UPDATE' and old.status='completed') then return new; end if;
 foreach u in array public.checkpoint_units(new.unit_id) loop
  select coalesce(array_agg(value->>'item_id'),'{}'::text[]) into weak_keys from jsonb_array_elements(new.results)
  where value->>'item_id' like u||'-%' and ((value->>'first_correct')::boolean is distinct from true or (value->>'hint_used')::boolean or (value->>'continued')::boolean);
  insert into public.learning_schedule(student_id,unit_id,anchor_on,due_on,weak) values(new.student_id,u,today,today+1,weak_keys)
  on conflict(student_id,unit_id) do update set weak=excluded.weak,
   stage=case when cardinality(excluded.weak)>0 then least(learning_schedule.stage,2) else learning_schedule.stage end,
   due_on=case when cardinality(excluded.weak)>0 then least(coalesce(learning_schedule.due_on,today+1),today+1) else learning_schedule.due_on end;
 end loop;
 return new;
end $$;
drop trigger if exists checkpoint_review on public.checkpoint_runs;
create trigger checkpoint_review after insert or update on public.checkpoint_runs for each row execute function public.checkpoint_review_schedule();
revoke all on function public.checkpoint_review_schedule() from public,anon,authenticated;

create or replace function public.reset_learning_records(p_students uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 if cardinality(p_students)>1000 or exists(select 1 from unnest(p_students) chosen(student_id) where not exists(select 1 from public.students s join public.classes c on c.id=s.class_id where s.id=chosen.student_id and c.teacher_id=auth.uid())) then raise exception 'not allowed' using errcode='42501'; end if;
 for sid in select distinct unnest(p_students) order by 1 loop
  insert into public.mission_epochs(student_id) values(sid) on conflict(student_id) do update set epoch=gen_random_uuid();
  delete from public.learning_sessions where student_id=sid;
  delete from public.learning_schedule where student_id=sid;
  delete from public.mission_runs where student_id=sid;
  delete from public.checkpoint_runs where student_id=sid;
 end loop;
end $$;
revoke all on function public.reset_learning_records(uuid[]) from public,anon;
grant execute on function public.reset_learning_records(uuid[]) to authenticated;

create or replace function public.reset_missions_with_progress()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.mission_epochs set epoch=gen_random_uuid() where student_id=old.student_id;
 delete from public.mission_runs where student_id=old.student_id;
 delete from public.checkpoint_runs where student_id=old.student_id;
 delete from public.learning_sessions where student_id=old.student_id;
 delete from public.learning_schedule where student_id=old.student_id;
 return old;
end $$;
commit;
