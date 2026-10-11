-- (선택) 교사 가입 초대 암호
-- 이 파일은 처음 설치에 필요 없습니다. 내 Supabase에 다른 선생님도 가입시키되, 초대한 분만 학급을 만들게 하고 싶을 때만 쓰세요.
-- 쓰는 순서
--   1) 아래 insert 줄의 '해시값' 자리에 초대 암호의 SHA-256(16진수 64자)을 넣고(주석 표시 -- 를 지우고) 이 파일 전체를 SQL Editor 에서 Run
--   2) src/lib/teacherId.ts 의 REQUIRE_INVITE 를 true 로 바꿔 다시 배포
-- 주의: 1)만 하고 2)를 하지 않으면(또는 해시를 넣지 않으면) 아무도 학급을 만들 수 없게 됩니다.
-- 되돌리기: schema.sql 의 teacher_classes 정책 만들기 부분을 다시 실행하세요.

-- ───────── 교사 초대 암호 (아이디+비밀번호 교사 로그인과 함께 사용) ─────────
-- 교사는 이메일 없이 '아이디+비밀번호'로 가입한다. 아무나 학급을 만들지 못하게,
-- 초대 암호를 통과한 계정만 teachers 표에 올라가고 그 계정만 학급을 만들 수 있다.

create table if not exists public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
drop policy if exists teachers_self_select on public.teachers;
create policy teachers_self_select on public.teachers for select using (user_id = auth.uid());
revoke all on public.teachers from anon, authenticated;
grant select on public.teachers to authenticated;

-- 초대 암호의 SHA-256 해시를 보관 (정책이 없으므로 앱에서 직접 읽을 수 없다)
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
-- ▼ 아래 줄의 '해시값' 자리에 초대 암호의 SHA-256(16진수 64자)를 넣고 실행하세요.
--   PowerShell 예:  $b=[Text.Encoding]::UTF8.GetBytes('내초대암호'); -join ([Security.Cryptography.SHA256]::Create().ComputeHash($b) | % { $_.ToString('x2') })
-- insert into public.app_settings (key, value) values ('teacher_invite_hash', '해시값')
--   on conflict (key) do update set value = excluded.value;

create or replace function public.check_teacher_invite(p_code text)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.app_settings
    where key = 'teacher_invite_hash'
      and value = encode(sha256(convert_to(trim(p_code), 'UTF8')), 'hex')
  );
$$;
revoke all on function public.check_teacher_invite(text) from public, anon;
grant execute on function public.check_teacher_invite(text) to anon, authenticated;

create or replace function public.redeem_teacher_invite(p_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'not allowed';
  end if;
  if not public.check_teacher_invite(p_code) then
    return false;
  end if;
  insert into public.teachers (user_id) values (auth.uid()) on conflict do nothing;
  return true;
end $$;
revoke all on function public.redeem_teacher_invite(text) from public, anon;
grant execute on function public.redeem_teacher_invite(text) to authenticated;

-- 학급은 승인된 교사만 만들 수 있다 (위의 teacher_classes 정책을 이것으로 바꾼다)
drop policy if exists teacher_classes on public.classes;
create policy teacher_classes on public.classes for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and exists (select 1 from public.teachers t where t.user_id = auth.uid()));
