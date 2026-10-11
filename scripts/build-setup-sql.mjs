#!/usr/bin/env node
// 처음 설치용 전체 SQL(supabase/setup.sql)을 개별 SQL 파일에서 만듭니다.
//   node scripts/build-setup-sql.mjs          setup.sql 을 새로 만든다
//   node scripts/build-setup-sql.mjs --check  setup.sql 이 개별 파일과 같은지, 빠진 SQL 파일이 없는지,
//                                             위험한 오류 코드(40001·40P01)가 없는지 확인한다
// 40001 을 쓰면 Supabase(PostgREST)가 같은 요청을 끝없이 다시 보내 서버 CPU 를 채웁니다. 상태가 바뀐 경우는 BR001 을 씁니다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'supabase')
// 적용 순서: 표·정책 → 교사 메모 → 꿈 이야기 → 미션 → 중간 평가 → 깊이 익히기·복습
const ORDER = ['schema', 'teacher_notes', 'dream_wishes', 'mission_runs', 'checkpoint_missions', 'deeper_learning']
const SKIP = new Set(['setup', 'optional-teacher-invite']) // 처음 설치에 넣지 않는 파일

const norm = (t) => t.replace(/\r\n/g, '\n')
const read = (name) => norm(readFileSync(join(dir, `${name}.sql`), 'utf8')).trimEnd()

const HEADER = [
  '-- 꿈꾸는 받침 여행 · 처음 설치용 전체 SQL',
  '-- Supabase 대시보드 → SQL Editor → New query 에 이 파일을 통째로 붙여 넣고 Run 하세요.',
  '-- 여러 번 실행해도 안전합니다.',
  '-- 아래 파일을 차례로 이어 붙인 것입니다. 직접 고치지 말고 개별 파일을 고친 뒤 `npm run build:sql` 로 다시 만드세요.',
  `-- 순서: ${ORDER.join(' → ')}`,
  '',
].join('\n')

const build = () => HEADER + ORDER.map((n) => `\n-- ═════ ${n}.sql ═════\n${read(n)}\n`).join('')

if (!process.argv.includes('--check')) {
  writeFileSync(join(dir, 'setup.sql'), build(), 'utf8')
  console.log(`supabase/setup.sql 을 만들었어요 (${ORDER.length}개 파일)`)
  process.exit(0)
}

let bad = 0
const fail = (m) => {
  bad++
  console.log('✗', m)
}
const ok = (m) => console.log('✓', m)

// 1) setup.sql 이 개별 파일과 같은가
let current = ''
try {
  current = norm(readFileSync(join(dir, 'setup.sql'), 'utf8'))
} catch {
  /* 없음 */
}
if (current === build()) ok('setup.sql 이 개별 SQL 파일과 같아요')
else fail('setup.sql 이 개별 SQL 파일과 달라요. `npm run build:sql` 로 다시 만드세요')

// 2) 빠진 SQL 파일이 없는가
const names = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.slice(0, -4))
const missing = names.filter((n) => !ORDER.includes(n) && !SKIP.has(n))
if (missing.length) fail(`setup.sql 순서에 없는 SQL 파일: ${missing.join(', ')} (scripts/build-setup-sql.mjs 의 ORDER 에 넣으세요)`)
else ok('SQL 파일이 모두 설치 순서에 들어 있어요')

// 3) 무한 재시도를 부르는 오류 코드가 없는가
let risky = 0
for (const n of names) {
  norm(readFileSync(join(dir, `${n}.sql`), 'utf8')).split('\n').forEach((line, i) => {
    if (/errcode\s*=\s*'(40001|40P01)'/i.test(line) || /sqlstate\s*'(40001|40P01)'/i.test(line)) {
      risky++
      fail(`${n}.sql:${i + 1} 에서 40001/40P01 오류 코드를 써요 (BR001 을 쓰세요)`)
    }
  })
}
if (!risky) ok('40001·40P01 오류 코드 없음 (서버 CPU 가 차는 재시도 문제 방지)')

console.log(bad === 0 ? '\n✅ 문제 없음' : `\n❌ 문제 ${bad}건`)
process.exit(bad === 0 ? 0 : 1)
