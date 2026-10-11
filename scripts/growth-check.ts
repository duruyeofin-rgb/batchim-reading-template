// 성장 분석 점검: 가짜 학생 기록으로 판정이 알맞은지 확인한다. (scripts/check.ts 에서 불러 쓴다)
import { UNITS } from '../src/data/curriculum'
import { type GAttempt, analyzeGrowth } from '../src/lib/growth'

let nextId = 1
const NOW = new Date('2026-10-20T12:00:00+09:00').getTime()
const day = (n: number, hour = 10) => new Date(NOW - n * 86_400_000 + (hour - 12) * 3_600_000).toISOString()

type Res = [boolean, boolean?] // [첫 시도 정답, (틀렸다면) 다시 풀어서 맞힘]

/** 한 회차의 기록 만들기 */
function session(unitId: string, level: 'word' | 'sentence', daysAgo: number, results: Res[], hour = 10): GAttempt[] {
  const u = UNITS.find((x) => x.id === unitId)!
  const out: GAttempt[] = []
  let minute = 0
  results.forEach(([first, fixed], i) => {
    const itemId = `${unitId}-${level === 'word' ? 'w' : 's'}${i}`
    const base = new Date(day(daysAgo, hour)).getTime()
    const mk = (ok: boolean, ft: boolean): GAttempt => ({
      id: nextId++,
      student_id: 's1',
      level,
      unit_id: unitId,
      item_id: itemId,
      target: (level === 'word' ? u.words[i]?.text : u.sentences[i]?.target) ?? `낱말${i}`,
      answer: null,
      is_correct: ok,
      first_try: ft,
      feedback: null,
      created_at: new Date(base + minute++ * 60_000).toISOString(),
    })
    out.push(mk(first, true))
    if (!first) out.push(mk(Boolean(fixed), false))
  })
  return out
}
/** 8문제 중 ok% 를 첫 시도에 맞히는 회차 (틀린 문제는 다시 풀어서 맞힘) */
/** shift 를 바꾸면 틀리는 문제가 달라진다 (회차마다 같은 문제만 틀리지 않게) */
const rate = (total: number, ok: number, shift = 0): Res[] =>
  Array.from({ length: total }, (_, i) => [(i + shift) % total < Math.round((ok / 100) * total), true])

let bad = 0
const expect = (cond: boolean, msg: string) => {
  if (!cond) {
    bad++
    console.log('✗ 성장 점검:', msg)
  }
}
const info = (name: string, g: ReturnType<typeof analyzeGrowth>) =>
  console.log(`  [${name}] 상태 ${g.status} | 첫시도 ${g.overall}% | 변화 ${g.trend} | ${g.summary}${g.tips[0] ? ' | 추천: ' + g.tips[0] : ''}`)

console.log('\n[성장 분석]')

// 1. 기록 없음
{
  const g = analyzeGrowth([], [], NOW)
  info('기록 없음', g)
  expect(g.status === 'few', '기록 없음은 기록 부족이어야 해요')
  expect(g.summary.includes('판단하기 어렵'), '기록 없음 요약')
  expect(g.changes.better.length === 0 && g.changes.hard.length === 0, '기록 없음인데 변화 문장이 나옴')
}

// 2. 기록 1회
{
  const g = analyzeGrowth(session('1-1', 'word', 0, rate(8, 50)), [], NOW)
  info('1회뿐', g)
  expect(g.status === 'few', '1회뿐인 학생을 판단하면 안 돼요')
  expect(g.trend === 'unknown', '1회뿐인데 추세가 나옴')
  expect(g.groups.every((x) => x.trend === 'few'), '1회뿐인데 받침 변화를 판단함')
}

// 3. 꾸준히 상승
{
  const a = [
    ...session('1-1', 'word', 6, rate(8, 50)),
    ...session('1-1', 'word', 3, rate(8, 75, 3)),
    ...session('1-1', 'word', 0, rate(8, 100)),
    ...session('1-2', 'word', 5, rate(8, 60, 1)),
    ...session('1-2', 'word', 1, rate(8, 90, 5)),
  ]
  const g = analyzeGrowth(a, [], NOW)
  info('상승', g)
  expect(g.trend === 'up', '꾸준히 오르는 학생의 추세')
  expect(g.status === 'stable', `상승하는 학생은 안정이어야 해요 (${g.status})`)
  expect(g.changes.better.some((t) => t.includes('→')), '좋아진 점 문장')
  expect(g.summary.includes('올라가고'), '상승 요약')
}

// 4. 계속 비슷
{
  const a = [
    ...session('1-1', 'word', 6, rate(8, 75)),
    ...session('1-1', 'word', 3, rate(8, 75, 3)),
    ...session('1-1', 'word', 0, rate(8, 75, 6)),
  ]
  const g = analyzeGrowth(a, [], NOW)
  info('비슷', g)
  expect(g.trend === 'flat', '비슷한 학생의 추세')
  expect(!g.summary.includes('올라가고') && !g.summary.includes('내려가고'), '비슷한데 오르내린다고 함')
}

// 5. 최근 떨어짐
{
  const a = [
    ...session('1-1', 'word', 6, rate(8, 100)),
    ...session('1-1', 'word', 3, rate(8, 75, 2)),
    ...session('1-1', 'word', 0, rate(8, 50, 5)),
  ]
  const g = analyzeGrowth(a, [], NOW)
  info('하락', g)
  expect(g.trend === 'down', '떨어지는 학생의 추세')
  expect(g.status === 'watch', `떨어지는 학생은 관찰이어야 해요 (${g.status})`)
}

// 6. 특정 받침(2-6, ㄺ)만 반복 오답
{
  const wrongSet = (): Res[] => Array.from({ length: 8 }, (_, i) => (i < 3 ? [false, true] : [true, true]) as Res)
  const a = [
    ...session('2-6', 'word', 6, wrongSet()),
    ...session('2-6', 'word', 3, wrongSet()),
    ...session('2-6', 'word', 0, wrongSet()),
    ...session('1-1', 'word', 5, rate(8, 100)),
    ...session('1-1', 'word', 2, rate(8, 100)),
  ]
  const g = analyzeGrowth(a, [], NOW)
  info('ㄺ 반복', g)
  expect(g.repeatTargets.length >= 2, '반복 오류 낱말을 찾지 못함')
  expect(g.status === 'check', `같은 오류가 여러 번 반복되면 교사 확인 (${g.status})`)
  expect(g.hardGroups.some((x) => x.group.id === '2-6'), '어려운 받침 묶음 2-6')
  expect(g.tips.some((t) => t.includes('함께 다시 읽어')), '반복 오류 추천')
  // 같은 낱말을 계속 틀리는데 "좋아지고 있다"고 하면 안 된다 (회차 안의 문제 순서가 변화로 보이던 오류)
  expect(!g.changes.better.some((t) => t.includes('ㄺ')), 'ㄺ 반복 오류인데 좋아졌다고 함')
  expect(g.groups.find((x) => x.group.id === '2-6')?.trend !== 'up', 'ㄺ 변화가 상승으로 나옴')
}

// 7. 단어는 잘하는데 문장에서 틀림
{
  const a = [
    ...session('1-3', 'word', 4, rate(8, 100)),
    ...session('1-3', 'word', 2, rate(8, 100)),
    ...session('1-3', 'sentence', 3, rate(8, 50)),
    ...session('1-3', 'sentence', 1, rate(8, 50, 4)),
  ]
  const g = analyzeGrowth(a, [], NOW)
  info('단어 O 문장 X', g)
  expect(g.wordSentGap, '단어·문장 차이를 찾지 못함')
  expect(g.tips.some((t) => t.includes('짧은 문장')), '문장 연결 추천')
}

// 8. 첫 시도는 틀리지만 다시 풀어서 고치는 학생
{
  const hesitant = (shift: number): Res[] => Array.from({ length: 8 }, (_, i) => ((i + shift) % 8 < 3 ? [true, true] : [false, true]) as Res)
  const a = [
    ...session('1-1', 'word', 5, hesitant(0)),
    ...session('1-1', 'word', 3, hesitant(3)),
    ...session('1-1', 'word', 0, hesitant(6)),
  ]
  const g = analyzeGrowth(a, [], NOW)
  info('망설이지만 고침', g)
  expect((g.fixedRate ?? 0) >= 90, '고쳐 푸는 비율')
  expect(g.tips.some((t) => t.includes('다시 생각해서 고치는 힘')), '고치는 힘 추천')
}

// 9. 읽기 자동 인식 실패 반복, 문제 정확도는 높음
{
  const reads: GAttempt[] = []
  for (const item of ['read-2-19-s0', 'read-2-19-s1']) {
    for (let n = 1; n <= 3; n++) {
      reads.push({
        id: nextId++,
        student_id: 's1',
        level: 'paragraph',
        unit_id: 'read-2-19',
        item_id: item,
        target: '문장',
        answer: '다른 글자',
        is_correct: false,
        first_try: n === 1,
        feedback: n === 3 ? '도움 필요' : null,
        created_at: day(0, 11 + n),
      })
    }
  }
  const a = [...session('1-1', 'word', 4, rate(8, 100)), ...session('1-1', 'word', 1, rate(8, 100)), ...reads]
  const g = analyzeGrowth(a, [], NOW)
  info('읽기 인식 실패', g)
  expect(g.status === 'check', '읽기 확인 대기는 교사 확인')
  expect(g.reading.pending === 2, `확인 대기 수 ${g.reading.pending}`)
  expect(g.tips.some((t) => t.includes('음성 인식 오류 가능성')), '음성 인식 안내')
  expect(!JSON.stringify(g.tips).includes('읽기 실패'), '읽기 실패 단정 표현')
}

// 단정하는 표현이 없어야 한다
{
  const forbidden = ['못합니다', '부진', '이해가 부족', '학습장애', '읽기 실패', '잘함', '못함']
  const g = analyzeGrowth(session('2-6', 'word', 0, rate(8, 30)), [], NOW)
  const all = JSON.stringify([g.summary, g.tips, g.changes, g.statusReasons])
  for (const w of forbidden) expect(!all.includes(w), `단정 표현 "${w}"`)
}

console.log(bad === 0 ? '성장 분석 점검 통과' : `성장 분석 점검 ${bad}건 실패`)
export const growthProblems = bad
