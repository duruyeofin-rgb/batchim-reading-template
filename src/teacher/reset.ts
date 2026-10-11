// 학생 기록 초기화 (교사 화면). 화면과 분리한 삭제 로직.
//  - 서버 연결(client)을 받아서 쓴다. 화면에서는 supabase 를, 점검에서는 다른 연결을 넣을 수 있다.
//  - 지울 것은 교사가 고른다. 같은 초기화를 다시 눌러도 안전하다(이미 지운 것은 건너뛴다).
//  - 지운 기록은 되돌릴 수 없다(백업 파일을 내려받는 기능은 두지 않는다).
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResetOptions {
  records: boolean // 문제 풀이 기록(attempts)과 단원 진도(progress). 성장 기록도 함께 사라진다
  stars: boolean // 별(꿈)과 꿈 세계에서 연 것(items·equipped)
  profile: boolean // 캐릭터와 꿈 직업 (다음에 들어오면 처음처럼 다시 고른다)
  wishes: boolean // 나의 꿈 이야기(학생이 쓴 글)
  notes: boolean // 교사 피드백 메모
}

/** 기본값: 학생 기록은 모두, 선생님이 남긴 메모는 남긴다 */
export const DEFAULT_RESET: ResetOptions = { records: true, stars: true, profile: true, wishes: true, notes: false }

export const RESET_CHOICES: { key: keyof ResetOptions; label: string; hint: string }[] = [
  { key: 'records', label: '문제 풀이 기록과 단원 진도', hint: '받침 성장·미션·날짜별 복습·이야기 생각하기 기록도 함께 사라져요' },
  { key: 'stars', label: '별과 꿈 세계에서 연 것', hint: '별 0개로 돌아가고, 연 내 모습·도구·장소가 닫혀요' },
  { key: 'profile', label: '캐릭터와 꿈 직업', hint: '다음에 들어오면 처음처럼 다시 골라요' },
  { key: 'wishes', label: '나의 꿈 이야기 (학생이 쓴 글)', hint: '꿈 완성 화면에 쓴 글이 지워져요' },
  { key: 'notes', label: '교사 피드백 메모 (선생님이 남긴 메모)', hint: '선생님이 쓴 메모도 지워져요' },
]

/** 고른 것이 하나라도 있나 */
export const hasAnyChoice = (o: ResetOptions) => o.records || o.stars || o.profile || o.wishes || o.notes

/** 선택에 따라 실제로 지우는 것 (점검과 안내에 쓴다) */
export function plannedSteps(o: ResetOptions): string[] {
  const out: string[] = []
  if (o.records) out.push('문제 풀이 기록', '단원 진도', '맞춤 미션 기록')
  if (o.stars) out.push('별과 연 꿈 세계')
  if (o.profile) out.push('캐릭터와 꿈 직업')
  if (o.wishes) out.push('나의 꿈 이야기')
  if (o.notes) out.push('교사 피드백 메모')
  return out
}

type DbError = { code?: string; message?: string } | null
const missingTable = (e: DbError, table: string) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || (new RegExp(table).test(e.message ?? '') && /exist|schema cache/i.test(e.message ?? '')))

export type ResetResult = { ok: true; done: string[] } | { ok: false; done: string[]; message: string }

/** 실패한 결과를 화면에 보여 줄 문장으로 (어디까지 지웠는지도 함께) */
export const failText = (r: { message: string; done: string[] }) => `${r.message}${r.done.length ? ` (여기까지 했어요: ${r.done.join(', ')})` : ''}`

/**
 * 고른 기록을 지운다. 학급 전체·현황표의 학생 줄·학생 상세 화면이 모두 이 한 곳을 쓴다.
 * 중간에 멈추면 어디까지 했는지 알려 준다 (다시 눌러도 안전하다).
 */
export async function resetStudents(client: SupabaseClient, studentIds: string[], o: ResetOptions): Promise<ResetResult> {
  const done: string[] = []
  if (studentIds.length === 0) return { ok: true, done }
  const fail = (step: string, e: DbError): ResetResult => ({ ok: false, done, message: `지우지 못했어요 (${step}): ${e?.message ?? '알 수 없는 오류'}` })

  try {
    if (o.records) {
      const a = await client.from('attempts').delete({ count: 'exact' }).in('student_id', studentIds)
      if (a.error) return fail('문제 풀이 기록', a.error)
      done.push(`문제 풀이 기록 ${a.count ?? 0}개`)
      // mission_runs.sql의 트리거가 미션 세대를 바꾸고 별도 미션 기록도 함께 지웁니다.
      const p = await client.from('progress').delete({ count: 'exact' }).in('student_id', studentIds)
      if (p.error) return fail('단원 진도', p.error)
      done.push(`단원 진도 ${p.count ?? 0}개`)
      const l = await client.rpc('reset_learning_records', {p_students: studentIds})
      if (l.error) return fail('복습·이야기 이해 기록', l.error)
      done.push('복습·이야기 이해 기록 초기화')
    }

    if (o.stars || o.profile) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (o.stars) Object.assign(patch, { dream_total: 0, items: [], equipped: {} })
      if (o.profile) Object.assign(patch, { character: null, job: null })
      const u = await client.from('students').update(patch).in('id', studentIds)
      if (u.error) return fail('별·캐릭터·직업', u.error)
      done.push([o.stars ? '별과 꿈 세계' : '', o.profile ? '캐릭터와 꿈 직업' : ''].filter(Boolean).join('·') + ' 초기화')
    }

    if (o.wishes) {
      const w = await client.from('dream_wishes').delete({ count: 'exact' }).in('student_id', studentIds)
      if (w.error && !missingTable(w.error, 'dream_wishes')) return fail('나의 꿈 이야기', w.error)
      done.push(`나의 꿈 이야기 ${w.error ? 0 : (w.count ?? 0)}개`)
    }

    if (o.notes) {
      const n = await client.from('teacher_notes').delete({ count: 'exact' }).in('student_id', studentIds)
      if (n.error && !missingTable(n.error, 'teacher_notes')) return fail('교사 피드백 메모', n.error)
      done.push(`교사 피드백 메모 ${n.error ? 0 : (n.count ?? 0)}개`)
    }
  } catch (e) {
    // 연결이 끊기는 등 예외로 멈춘 경우에도 화면에 이유를 보여 준다
    return { ok: false, done, message: `지우지 못했어요: ${(e as Error).message}` }
  }

  return { ok: true, done }
}
