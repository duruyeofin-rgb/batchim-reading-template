// 기록 초기화와 QR 입장 점검: 가짜 서버로 "무엇을 지우고 무엇을 남기는지", QR 주소 읽기, 기기-서버 값 비교를 확인한다.
// (scripts/check.ts 에서 불러 쓴다)
import type { SupabaseClient } from '@supabase/supabase-js'
import { codeFromUrl } from '../src/lib/qr'
import { safeToCompare, serverStateDiffers } from '../src/lib/sync'
import { DEFAULT_RESET, type ResetOptions, failText, hasAnyChoice, plannedSteps, resetStudents } from '../src/teacher/reset'

let bad = 0
const expect = (cond: boolean, msg: string) => {
  if (!cond) {
    bad++
    console.log('✗ 초기화 점검:', msg)
  }
}

interface Call {
  table: string
  op: 'delete' | 'update' | 'rpc'
  patch?: Record<string, unknown>
  ids: string[]
}

/** 서버 호출을 기록만 하는 가짜 연결 */
function mock(o: { failOn?: string; missing?: string[] } = {}) {
  const calls: Call[] = []
  const reply = (table: string) => {
    if (o.failOn === table) return { error: { message: 'boom' }, count: null }
    if (o.missing?.includes(table)) return { error: { code: '42P01', message: `relation "public.${table}" does not exist` }, count: null }
    return { error: null, count: 3 }
  }
  const client = {
    rpc: async (name: string, args: {p_students: string[]}) => {calls.push({table:name,op:'rpc',ids:args.p_students});return reply(name)},
    from: (table: string) => ({
      delete: () => ({
        in: async (_c: string, ids: string[]) => {
          calls.push({ table, op: 'delete', ids })
          return reply(table)
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        in: async (_c: string, ids: string[]) => {
          calls.push({ table, op: 'update', patch, ids })
          return o.failOn === table ? { error: { message: 'boom' } } : { error: null }
        },
      }),
    }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}
const tablesOf = (calls: Call[], op: Call['op']) => calls.filter((c) => c.op === op).map((c) => c.table)
const none: ResetOptions = { records: false, stars: false, profile: false, wishes: false, notes: false }

console.log('\n[기록 초기화·QR]')

// 기본 선택: 학생 기록은 모두, 선생님 메모는 남김
{
  expect(DEFAULT_RESET.notes === false, '교사 메모는 기본으로 남겨야 해요')
  const steps = plannedSteps(DEFAULT_RESET)
  for (const w of ['문제 풀이 기록', '단원 진도', '별과 연 꿈 세계', '캐릭터와 꿈 직업', '나의 꿈 이야기'])
    expect(steps.includes(w), `기본 초기화에 "${w}" 가 없어요`)
  expect(!steps.includes('교사 피드백 메모'), '기본 초기화가 교사 메모를 지워요')
  expect(!hasAnyChoice(none), '아무것도 고르지 않았으면 지울 것이 없는 것으로 봐야 해요')
}

// 기본값으로 초기화: 한 학생
const ids = ['stu-1']
{
  const { client, calls } = mock()
  const r = await resetStudents(client, ids, DEFAULT_RESET)
  expect(calls.some(c => c.table === 'reset_learning_records' && c.op === 'rpc'), '복습·이야기 초기화가 빠졌어요')
  expect(r.ok, '기본 초기화가 성공해야 해요')
  expect(tablesOf(calls, 'delete').join() === 'attempts,progress,dream_wishes', `지운 표: ${tablesOf(calls, 'delete').join()}`)
  const up = calls.find((c) => c.op === 'update')
  expect(!!up && up.table === 'students', '학생 표를 고쳐야 해요')
  expect(up?.patch?.dream_total === 0 && Array.isArray(up?.patch?.items) && (up?.patch?.items as unknown[]).length === 0, '별과 연 것이 0 으로 돌아가야 해요')
  expect(up?.patch?.character === null && up?.patch?.job === null, '캐릭터와 직업이 비워져야 해요')
  expect(!tablesOf(calls, 'delete').includes('teacher_notes'), '교사 메모를 지웠어요')
  expect(calls.every((c) => c.ids.length === 1 && c.ids[0] === 'stu-1'), '다른 학생까지 건드렸어요')
}

// 기록만 선택: 학생 표(별·직업)는 건드리지 않는다
{
  const { client, calls } = mock()
  const r = await resetStudents(client, ids, { ...none, records: true })
  expect(r.ok && tablesOf(calls, 'delete').join() === 'attempts,progress' && !calls.some((c) => c.op === 'update'), '기록만 고르면 기록만 지워야 해요')
}

// 별만 선택: 캐릭터·직업은 남긴다
{
  const { client, calls } = mock()
  await resetStudents(client, ids, { ...none, stars: true })
  const up = calls.find((c) => c.op === 'update')
  expect(!!up && 'dream_total' in (up.patch ?? {}) && !('job' in (up.patch ?? {})) && !('character' in (up.patch ?? {})), '별만 고르면 직업·캐릭터는 남겨야 해요')
  expect(!calls.some((c) => c.op === 'delete'), '별만 고르면 아무 표에서도 지우면 안 돼요')
}

// 직업·캐릭터만 선택: 별은 남긴다
{
  const { client, calls } = mock()
  await resetStudents(client, ids, { ...none, profile: true })
  const up = calls.find((c) => c.op === 'update')
  expect(!!up && up.patch?.job === null && !('dream_total' in (up.patch ?? {})), '직업만 고르면 별은 남겨야 해요')
}

// 교사 메모까지 선택
{
  const { client, calls } = mock()
  await resetStudents(client, ids, { ...DEFAULT_RESET, notes: true })
  expect(tablesOf(calls, 'delete').includes('teacher_notes'), '교사 메모를 고르면 지워야 해요')
}

// 아무것도 안 고르면 서버를 건드리지 않는다
{
  const { client, calls } = mock()
  const r = await resetStudents(client, ids, none)
  expect(r.ok && calls.length === 0, '선택이 없는데 서버를 건드렸어요')
}
{
  const { client, calls } = mock()
  const r = await resetStudents(client, [], DEFAULT_RESET)
  expect(r.ok && calls.length === 0, '학생이 없는데 서버를 건드렸어요')
}

// 중간에 실패하면 어디까지 했는지 알려 준다
{
  const { client } = mock({ failOn: 'progress' })
  const r = await resetStudents(client, ids, DEFAULT_RESET)
  expect(!r.ok, '실패해야 하는데 성공으로 나왔어요')
  if (!r.ok) {
    expect(r.done.length === 1 && r.done[0].includes('문제 풀이 기록'), `여기까지 한 일: ${r.done.join()}`)
    expect(r.message.includes('단원 진도') && r.message.includes('boom'), '실패 문구에 지우지 못한 것과 이유가 있어야 해요')
    expect(!/을\(를\)|이\(가\)/.test(r.message), '실패 문구에 어색한 조사가 있어요')
  }
}

// 꿈 이야기·교사 메모 표가 아직 없어도 초기화는 끝까지 간다
{
  const { client } = mock({ missing: ['dream_wishes', 'teacher_notes'] })
  const r = await resetStudents(client, ids, { ...DEFAULT_RESET, notes: true })
  expect(r.ok, '아직 만들지 않은 표 때문에 초기화가 멈췄어요')
}

// 학급 전체: 학생 여러 명을 한 번에
{
  const { client, calls } = mock()
  const all = ['a', 'b', 'c', 'd']
  await resetStudents(client, all, DEFAULT_RESET)
  expect(calls.every((c) => c.ids.length === 4), '학급 전체는 모든 학생 번호를 한꺼번에 넘겨야 해요')
}

// 실패 문구
expect(failText({ message: '지우지 못했어요 (단원 진도): boom', done: [] }) === '지우지 못했어요 (단원 진도): boom', '실패 문구(한 일 없음)')
expect(failText({ message: '실패', done: ['문제 풀이 기록 3개'] }) === '실패 (여기까지 했어요: 문제 풀이 기록 3개)', '실패 문구(한 일 있음)')

// 연결이 끊겨 예외가 나도 화면에 이유가 나온다
{
  const broken = { from: () => { throw new Error('연결 끊김') } } as unknown as SupabaseClient
  const r = await resetStudents(broken, ['stu-1'], DEFAULT_RESET)
  expect(!r.ok && r.message.includes('연결 끊김'), '연결 예외가 화면 문구로 바뀌어야 해요')
}

// 한 학생만: 표마다 그 학생 번호만 넘긴다
{
  const { client, calls } = mock()
  await resetStudents(client, ['stu-9'], DEFAULT_RESET)
  expect(calls.length > 0 && calls.every((c) => c.ids.length === 1 && c.ids[0] === 'stu-9'), '한 학생 초기화가 다른 학생까지 건드렸어요')
}

// QR 주소 읽기
expect(codeFromUrl('?c=113312') === '113312', 'QR 코드 읽기')
expect(codeFromUrl('?c=113312&x=1') === '113312', '다른 값이 붙어도 코드를 읽어야 해요')
expect(codeFromUrl('') === '' && codeFromUrl('?c=') === '' && codeFromUrl('?c=123') === '', '코드가 없거나 6자리가 아니면 빈 값이어야 해요')
expect(codeFromUrl('?c=11-33-12') === '113312', '기호가 섞여도 숫자만 읽어야 해요')

// 기기와 서버 값 비교
{
  const local = { dream_total: 40, character: 'girl', job: 'doctor', items: ['doctor-outfit-0'] }
  expect(!serverStateDiffers(local, { ...local, items: [...local.items] }), '같은 값을 다르다고 했어요')
  expect(serverStateDiffers(local, { ...local, dream_total: 0, items: [], character: null, job: null }), '초기화된 서버 값을 알아채야 해요')
  expect(serverStateDiffers(local, { ...local, job: null }), '직업이 비워진 것을 알아채야 해요')
  expect(serverStateDiffers(local, { ...local, items: [] }), '연 요소가 사라진 것을 알아채야 해요')
  expect(!safeToCompare(1, 0, 100000) && !safeToCompare(0, 99000, 100000) && safeToCompare(0, 0, 100000), '비교해도 되는 때 판정')
}


console.log(bad === 0 ? '기록 초기화·QR 점검 통과' : `기록 초기화·QR 점검 ${bad}건 실패`)
export const resetProblems = bad
