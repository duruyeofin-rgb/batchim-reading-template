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

-- 신규 프로젝트의 기본 권한 설정과 무관하게 앱 호출에 필요한 권한을 명시합니다.
-- 행 접근은 위 RLS 정책이 제한하며, 학생 생성은 join_class 함수로만 합니다.
grant select, insert, delete on public.classes to authenticated;
grant select, delete on public.students to authenticated;
grant select, insert, update, delete on public.progress to authenticated;
grant select, insert, delete on public.attempts to authenticated;

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

revoke all on function public.join_class(text, int) from public, anon;
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

revoke all on function public.class_size(text) from public, anon;
grant execute on function public.class_size(text) to authenticated;
