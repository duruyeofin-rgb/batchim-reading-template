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
