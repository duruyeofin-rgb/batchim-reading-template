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
