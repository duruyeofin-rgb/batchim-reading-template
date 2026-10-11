#!/usr/bin/env node
// 설치 점검: 내 Supabase 에 setup.sql 이 제대로 적용됐고, 접근 규칙(RLS)이 실제로 지켜지는지 시험합니다.
//   npm run verify:install
// 읽는 값: .env.local 의 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (또는 같은 이름의 환경변수)
//
// 점검하는 동안 점검용 교사 계정 2개, 학급 1개, 학생 2명이 잠깐 생기고 학급(과 학생·기록)은 마지막에 지웁니다.
// 점검용 교사·익명 계정은 Supabase 의 Authentication → Users 에 남습니다(이름이 verify- 로 시작하는 교사). 지워도 됩니다.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
    )
  } catch {
    return {}
  }
}
const clean = (v) => v?.replace(/[^\x21-\x7e]/g, '')
const env = { ...readEnvFile('.env.local'), ...process.env }
const URL = clean(env.VITE_SUPABASE_URL)
const KEY = clean(env.VITE_SUPABASE_ANON_KEY)

let pass = 0
let failed = 0
const ok = (cond, msg, hint) => {
  if (cond) pass++
  else failed++
  console.log(cond ? '✔' : '✗', msg)
  if (!cond && hint) console.log('   →', hint)
  return cond
}
const stop = (msg) => {
  console.log('\n❌ 여기서 멈춥니다:', msg)
  process.exit(1)
}

// 0) 설정 값
if (!URL || !KEY) stop('.env.local 에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 채워 주세요. (.env.example 을 복사해서 쓰면 됩니다)')
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(URL)) console.log('! 주소가 https://<프로젝트>.supabase.co 모양이 아니에요:', URL)
const jwtRole = (k) => {
  try {
    return JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role
  } catch {
    return null
  }
}
if (KEY.startsWith('sb_secret_') || jwtRole(KEY) === 'service_role')
  stop('비밀 키(service_role / sb_secret_…)가 들어 있어요. 앱에는 공개용 anon(publishable) 키만 넣어야 합니다. 이 키는 다시 만들어(회전) 주세요.')
console.log('프로젝트:', URL, '\n')

const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const tag = Math.random().toString(36).slice(2, 8)
const teacherA = mk()
const teacherB = mk()
const studentA = mk()
const studentB = mk()
const nobody = mk() // 로그인하지 않은 사람
const empty = (r) => !r.error && (r.data?.length ?? 0) === 0 // 아무 것도 못 봄
const denied = (r) => !!r.error // 거부됨

// 1) 표가 모두 만들어졌는가 (교사 로그인 뒤에 확인)
const signup = async (client, name) => {
  const r = await client.auth.signUp({ email: `verify-${name}-${tag}@teacher.batchim.invalid`, password: `Pw-${name}-${tag}-${Date.now()}` })
  if (r.error) {
    const m = r.error.message || ''
    const hint = /disabled/i.test(m)
      ? 'Authentication → Sign In / Providers 에서 Email 을 켜 주세요.'
      : /rate|limit/i.test(m)
        ? '잠시(약 1시간) 뒤 다시 해 보세요. 가입 요청 횟수 제한에 걸렸어요.'
        : '메시지를 그대로 AI나 도움 받을 분께 보여 주세요.'
    stop(`교사 가입이 안 돼요: ${m}\n   → ${hint}`)
  }
  if (!r.data.session) stop('교사 가입은 됐지만 로그인이 되지 않았어요.\n   → Authentication → Sign In / Providers → Email 의 "Confirm email" 을 꺼 주세요.')
  return r.data.user.id
}
console.log('— 설치 확인')
await signup(teacherA, 'a')
ok(true, '교사 가입·로그인 (Email 켜짐, Confirm email 꺼짐)')
const TABLES = ['classes', 'students', 'progress', 'attempts', 'teacher_notes', 'dream_wishes', 'mission_epochs', 'mission_runs', 'checkpoint_runs', 'checkpoint_rewards', 'learning_sessions', 'learning_schedule']
const missing = []
for (const t of TABLES) {
  const r = await teacherA.from(t).select('*').limit(1)
  if (r.error) missing.push(`${t} (${r.error.message})`)
}
ok(missing.length === 0, `필요한 표가 모두 있음 (${TABLES.length}개)`, missing.length ? `없는 표: ${missing.join(', ')}\n     supabase/setup.sql 을 통째로 다시 Run 해 보세요.` : undefined)
if (missing.some((m) => m.startsWith('classes ('))) stop('classes 표가 없어요. supabase/setup.sql 을 Run 했는지 확인하세요.')

// 2) 학급·학생 만들기
let cls
for (let i = 0; i < 3 && !cls; i++) {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const r = await teacherA.from('classes').insert({ name: `verify-${tag}`, code, student_count: 3 }).select().single()
  if (!r.error) cls = { ...r.data, code }
  else if (!/duplicate|unique/i.test(r.error.message)) {
    ok(false, `학급 만들기: ${r.error.message}`, '학급을 만들 수 없어요. supabase/optional-teacher-invite.sql 을 실행하지 않았는지 확인하세요(그 파일은 처음 설치에 필요 없어요).')
    stop('학급을 만들지 못해 나머지 점검을 할 수 없어요.')
  }
}
ok(!!cls, '교사가 학급을 만들 수 있음')

const anon = await studentA.auth.signInAnonymously()
if (anon.error)
  stop(`학생 입장(익명 로그인)이 안 돼요: ${anon.error.message}\n   → Authentication → Sign In / Providers 에서 "Anonymous sign-ins" 를 켜 주세요.`)
await studentB.auth.signInAnonymously()
ok(true, '학생 익명 로그인 (Anonymous sign-ins 켜짐)')

const size = await studentA.rpc('class_size', { p_code: cls.code })
ok(!size.error && size.data === 3, '학급 코드로 인원 수를 조회할 수 있음', size.error?.message)
const wrong = await studentA.rpc('class_size', { p_code: '000000' })
ok(!wrong.error && wrong.data === null, '틀린 학급 코드는 아무 정보도 주지 않음')
const jA = await studentA.rpc('join_class', { p_code: cls.code, p_number: 1 })
const jB = await studentB.rpc('join_class', { p_code: cls.code, p_number: 2 })
if (!ok(!jA.error && !jB.error, '학생 두 명이 학급 코드와 번호로 입장함', jA.error?.message || jB.error?.message)) stop('학생 입장이 안 돼서 나머지 점검을 할 수 없어요.')
const A = jA.data
const B = jB.data

const base = { class_id: cls.id, level: 'paragraph', unit_id: 'read-2-44', item_id: 'read-2-44-s0', target: '문장' }
const att = (sid) => ({ ...base, student_id: sid, answer: '읽음', is_correct: false, first_try: true, similarity: 0.5, listened_first: false, feedback: null })
const w = await studentA.from('attempts').insert(att(A.id))
ok(!w.error, '학생이 자기 학습 기록을 저장할 수 있음', w.error?.message)
await studentB.from('attempts').insert(att(B.id))

// 3) 접근 규칙: 볼 수 있어야 할 것
console.log('\n— 볼 수 있어야 하는 것')
const mine = await studentA.from('students').select('id')
ok(!mine.error && mine.data.length === 1 && mine.data[0].id === A.id, '학생은 자기 정보만 보임')
const myAtt = await studentA.from('attempts').select('id').eq('student_id', A.id)
ok(!myAtt.error && myAtt.data.length === 1, '학생은 자기 기록을 볼 수 있음')
const tClass = await teacherA.from('classes').select('id').eq('id', cls.id)
const tStu = await teacherA.from('students').select('id').eq('class_id', cls.id)
const tAtt = await teacherA.from('attempts').select('id').eq('class_id', cls.id)
ok(tClass.data?.length === 1 && tStu.data?.length === 2 && tAtt.data?.length === 2, '선생님은 자기 학급의 학생 2명과 기록 2개를 볼 수 있음')

// 4) 접근 규칙: 막혀야 할 것
console.log('\n— 막혀야 하는 것')
for (const t of ['classes', 'students', 'attempts', 'progress']) {
  const r = await nobody.from(t).select('id').limit(5)
  ok(empty(r) || denied(r), `로그인하지 않은 사람은 ${t} 를 볼 수 없음`)
}
const otherStu = await studentA.from('students').select('id').eq('id', B.id)
ok(empty(otherStu) || denied(otherStu), '학생은 다른 학생의 정보를 볼 수 없음')
const otherAtt = await studentB.from('attempts').select('id').eq('student_id', A.id)
ok(empty(otherAtt) || denied(otherAtt), '학생은 다른 학생의 학습 기록을 볼 수 없음')
const studentClasses = await studentA.from('classes').select('id')
ok(empty(studentClasses) || denied(studentClasses), '학생은 학급 목록을 볼 수 없음')
const forge = await studentA.from('attempts').insert(att(B.id))
ok(denied(forge), '학생은 다른 학생 이름으로 기록을 저장할 수 없음')
const move = await studentA.from('students').update({ class_id: randomUUID() }).eq('id', A.id)
ok(denied(move), '학생은 자기 학급을 마음대로 바꿀 수 없음')
const mkClass = await studentA.from('classes').insert({ name: `verify-x-${tag}`, code: '999999', student_count: 1 })
ok(denied(mkClass), '학생(익명)은 학급을 만들 수 없음')

await signup(teacherB, 'b')
const bClass = await teacherB.from('classes').select('id').eq('id', cls.id)
const bStu = await teacherB.from('students').select('id').eq('class_id', cls.id)
const bAtt = await teacherB.from('attempts').select('id').eq('class_id', cls.id)
ok(empty(bClass) && empty(bStu) && empty(bAtt), '다른 선생님은 내 학급·학생·기록을 볼 수 없음')
const bForge = await teacherB.from('attempts').insert(att(A.id))
ok(denied(bForge), '다른 선생님은 내 학급에 기록을 넣을 수 없음')
const bDel = await teacherB.from('classes').delete().eq('id', cls.id)
const stillThere = await teacherA.from('classes').select('id').eq('id', cls.id)
ok(stillThere.data?.length === 1, '다른 선생님은 내 학급을 지울 수 없음', bDel.error?.message)

// 5) 정리: 점검용 학급(과 학생·기록) 지우기
const del = await teacherA.from('classes').delete().eq('id', cls.id)
const gone = await teacherA.from('classes').select('id').eq('id', cls.id)
ok(!del.error && empty(gone), '점검용 학급을 지웠음', del.error?.message)

console.log(`\n${failed === 0 ? '✅ 모두 통과' : '❌ 실패가 있어요'} — 통과 ${pass}개, 실패 ${failed}개`)
console.log('점검용 교사 계정(이름이 verify- 로 시작)과 익명 계정은 Supabase → Authentication → Users 에서 지울 수 있어요.')
process.exit(failed === 0 ? 0 : 1)
