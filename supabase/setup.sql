-- 꿈꾸는 받침 여행 · 처음 설치용 전체 SQL
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일을 통째로 붙여 넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- 아래 파일을 차례로 이어 붙인 것입니다. 직접 고치지 말고 개별 파일을 고친 뒤 `npm run build:sql` 로 다시 만드세요.
-- 순서: schema → teacher_notes → dream_wishes → mission_runs → checkpoint_missions → deeper_learning

-- ═════ schema.sql ═════
-- 꿈꾸는 받침 여행 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하세요. (여러 번 실행해도 안전하게 만들었습니다)

-- 학급
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  code text not null unique,
  student_count int not null default 25 check (student_count between 1 and 30),
  created_at timestamptz not null default now()
);

-- 학생 (이름 저장 안 함)
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  number int not null,
  auth_uid uuid,
  character text,
  job text,
  dream_total int not null default 0,
  items text[] not null default '{}',
  equipped jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, number)
);

-- 단원·단계별 진도
create table if not exists public.progress (
  student_id uuid not null references public.students(id) on delete cascade,
  unit_id text not null,          -- 예: '1-1', '2-6', 'story-3'
  level text not null check (level in ('word','sentence','paragraph')),
  first_try_correct int not null default 0,
  total int not null default 0,
  passed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (student_id, unit_id, level)
);

-- 문제 하나하나의 결과
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  level text not null check (level in ('word','sentence','paragraph')),
  unit_id text not null,
  item_id text not null,
  target text not null,           -- 문제 낱말/문장
  answer text,                    -- 학생이 고른 답 또는 인식된 글자
  is_correct boolean not null,
  first_try boolean not null,
  similarity numeric,             -- 문단 읽기 유사도(0~1)
  listened_first boolean default false,
  feedback text,
  created_at timestamptz not null default now()
);

create index if not exists attempts_class_idx on public.attempts (class_id, created_at);
create index if not exists attempts_student_idx on public.attempts (student_id, unit_id);
create index if not exists students_auth_idx on public.students (auth_uid);

alter table public.classes  enable row level security;
alter table public.students enable row level security;
alter table public.progress enable row level security;
alter table public.attempts enable row level security;

-- 정책을 다시 만들 수 있게 먼저 지웁니다
drop policy if exists teacher_classes on public.classes;
drop policy if exists teacher_students on public.students;
drop policy if exists teacher_progress on public.progress;
drop policy if exists teacher_attempts on public.attempts;
drop policy if exists student_self_select on public.students;
drop policy if exists student_self_update on public.students;
drop policy if exists student_progress on public.progress;
drop policy if exists student_attempts_insert on public.attempts;
drop policy if exists student_attempts_select on public.attempts;

-- 교사(익명 아닌 사용자)는 자기 학급만
create policy teacher_classes on public.classes for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);

create policy teacher_students on public.students for all
  using (exists (select 1 from public.classes c where c.id = students.class_id and c.teacher_id = auth.uid()));

create policy teacher_progress on public.progress for all
  using (exists (select 1 from public.students s join public.classes c on c.id = s.class_id
                 where s.id = progress.student_id and c.teacher_id = auth.uid()));

create policy teacher_attempts on public.attempts for all
  using (exists (select 1 from public.classes c where c.id = attempts.class_id and c.teacher_id = auth.uid()));

-- 학생(익명 로그인)은 자기 기록만
create policy student_self_select on public.students for select using (auth_uid = auth.uid());
create policy student_self_update on public.students for update
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

create policy student_progress on public.progress for all
  using (exists (select 1 from public.students s where s.id = progress.student_id and s.auth_uid = auth.uid()))
  with check (exists (select 1 from public.students s where s.id = progress.student_id and s.auth_uid = auth.uid()));

create policy student_attempts_insert on public.attempts for insert
  with check (exists (select 1 from public.students s
                      where s.id = attempts.student_id and s.class_id = attempts.class_id and s.auth_uid = auth.uid()));
create policy student_attempts_select on public.attempts for select
  using (exists (select 1 from public.students s where s.id = attempts.student_id and s.auth_uid = auth.uid()));

-- 안전장치: students 는 지정한 열만 수정할 수 있게 합니다.
-- (학생이 class_id·auth_uid 를 바꿔서 다른 학급으로 옮겨 가는 것을 막습니다)
revoke update on public.students from anon, authenticated;
grant update (character, job, dream_total, items, equipped, updated_at) on public.students to authenticated;

-- 학생 입장: 학급 코드 + 번호
create or replace function public.join_class(p_code text, p_number int)
returns public.students
language plpgsql security definer set search_path = public as $$
declare c public.classes; s public.students;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.classes where code = upper(trim(p_code));
  if not found then raise exception 'invalid code'; end if;
  if p_number < 1 or p_number > c.student_count then raise exception 'invalid number'; end if;
  insert into public.students (class_id, number, auth_uid)
  values (c.id, p_number, auth.uid())
  on conflict (class_id, number) do update set auth_uid = excluded.auth_uid, updated_at = now()
  returning * into s;
  return s;
end $$;

revoke all on function public.join_class(text, int) from public;
grant execute on function public.join_class(text, int) to authenticated;

-- 추가: 번호 선택 화면에 필요한 학급 인원 수 조회 (코드가 맞을 때만 숫자를 돌려줌)
create or replace function public.class_size(p_code text)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select student_count into n from public.classes where code = upper(trim(p_code));
  return n;  -- 코드가 틀리면 null
end $$;

revoke all on function public.class_size(text) from public;
grant execute on function public.class_size(text) to authenticated;

-- ═════ teacher_notes.sql ═════
-- 교사 피드백 메모 (받침 성장 기록 화면의 「교사 피드백」)
-- 새 표 1개만 추가합니다. 기존 표와 기록은 건드리지 않습니다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하세요. (여러 번 실행해도 안전합니다)
--
-- 되돌리기(이 기능을 없애고 싶을 때):  drop table if exists public.teacher_notes;

create table if not exists public.teacher_notes (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists teacher_notes_student_idx on public.teacher_notes (student_id, created_at desc);

alter table public.teacher_notes enable row level security;

drop policy if exists teacher_notes_all on public.teacher_notes;

-- 자기 학급의 학생에 대한 메모만 보고 쓰고 지울 수 있습니다. 학생(익명 로그인)은 접근할 수 없습니다.
create policy teacher_notes_all on public.teacher_notes for all
  using (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = teacher_notes.class_id and c.teacher_id = auth.uid())
  )
  with check (
    teacher_id = auth.uid()
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.students s join public.classes c on c.id = s.class_id
      where s.id = teacher_notes.student_id and c.id = teacher_notes.class_id and c.teacher_id = auth.uid()
    )
  );

revoke all on public.teacher_notes from anon;
grant select, insert, delete on public.teacher_notes to authenticated;

-- ═════ dream_wishes.sql ═════
-- 나의 꿈 이야기 (꿈 완성 화면에서 학생이 직업으로 하고 싶은 일을 쓰는 한 문장)
-- 새 표 1개만 추가합니다. 기존 표와 기록은 건드리지 않습니다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하세요. (여러 번 실행해도 안전합니다)
--
-- 접근 규칙(RLS)
--   · 학생(익명 로그인): 자기 글만 읽고, 쓰고, 고칠 수 있다.
--   · 교사: 자기 학급 학생의 글만 읽고, 부적절한 글은 지울 수 있다.
--   · 로그인하지 않은 사람: 아무것도 못 한다.
-- 되돌리기(이 기능을 없애고 싶을 때):  drop table if exists public.dream_wishes;

create table if not exists public.dream_wishes (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  job text not null,
  wish text not null check (char_length(wish) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, job)
);

create index if not exists dream_wishes_class_idx on public.dream_wishes (class_id, updated_at desc);

alter table public.dream_wishes enable row level security;

drop policy if exists dream_wishes_student_select on public.dream_wishes;
drop policy if exists dream_wishes_student_insert on public.dream_wishes;
drop policy if exists dream_wishes_student_update on public.dream_wishes;
drop policy if exists dream_wishes_teacher_select on public.dream_wishes;
drop policy if exists dream_wishes_teacher_delete on public.dream_wishes;

create policy dream_wishes_student_select on public.dream_wishes for select
  using (exists (select 1 from public.students s where s.id = dream_wishes.student_id and s.auth_uid = auth.uid()));

create policy dream_wishes_student_insert on public.dream_wishes for insert
  with check (exists (
    select 1 from public.students s
    where s.id = dream_wishes.student_id and s.class_id = dream_wishes.class_id and s.auth_uid = auth.uid()
  ));

create policy dream_wishes_student_update on public.dream_wishes for update
  using (exists (select 1 from public.students s where s.id = dream_wishes.student_id and s.auth_uid = auth.uid()))
  with check (exists (
    select 1 from public.students s
    where s.id = dream_wishes.student_id and s.class_id = dream_wishes.class_id and s.auth_uid = auth.uid()
  ));

create policy dream_wishes_teacher_select on public.dream_wishes for select
  using (exists (select 1 from public.classes c where c.id = dream_wishes.class_id and c.teacher_id = auth.uid()));

create policy dream_wishes_teacher_delete on public.dream_wishes for delete
  using (exists (select 1 from public.classes c where c.id = dream_wishes.class_id and c.teacher_id = auth.uid()));

revoke all on public.dream_wishes from anon;
grant select, insert, update, delete on public.dream_wishes to authenticated;

-- ═════ mission_runs.sql ═════
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

-- ═════ checkpoint_missions.sql ═════
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

-- ═════ deeper_learning.sql ═════
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
