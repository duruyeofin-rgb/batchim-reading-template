// 읽기에서 3번 읽어도 통과하지 못했을 때의 '선생님 확인' 표시들.
// 별도 DB 열 없이 attempts 표의 feedback 글자로 구분한다.
//  - 학생이 3번 틀리면 TAG_HELP 가 붙은 기록이 남고, 학생 화면은 선생님이 확인할 때까지 기다린다.
//  - 선생님이 교사 화면에서 TAG_PASS 또는 TAG_SKIP 기록을 남기면 학생 화면이 다음으로 넘어간다.
export const TAG_HELP = '도움 필요'
export const TAG_PASS = '선생님 확인(통과)'
export const TAG_SKIP = '선생님 확인(넘어가기)'

export const TEACHER_TAGS = [TAG_PASS, TAG_SKIP]
export const isTeacherTag = (f: string | null | undefined) => f === TAG_PASS || f === TAG_SKIP

/** 대기 목록 계산에 필요한 기록의 최소 모양 (attempts 표의 한 줄) */
export interface HelpAttempt {
  id: number
  student_id: string
  level: string
  unit_id: string
  item_id: string
  target: string
  answer: string | null
  is_correct: boolean
  feedback: string | null
}

export interface HelpRequest {
  key: string
  student_id: string
  unit_id: string
  item_id: string
  target: string
  /** 최근 읽은 글자(인식 결과) 최대 3개 */
  answers: string[]
  last_id: number
}

/**
 * 선생님 확인을 기다리는 문장들.
 * 학생이 3번 읽어도 통과하지 못해 '도움 필요'가 남았고, 그 뒤로 선생님의 확인(통과·넘어가기)이나
 * 학생의 통과 기록이 없는 문장이 대기 중이다.
 */
export function pendingHelp(attempts: HelpAttempt[]): HelpRequest[] {
  const open = new Map<string, HelpRequest>()
  const recent = new Map<string, string[]>()
  const sorted = attempts.filter((a) => a.level === 'paragraph').sort((a, b) => a.id - b.id)
  for (const a of sorted) {
    const key = `${a.student_id}|${a.item_id}`
    if (isTeacherTag(a.feedback) || a.is_correct) {
      open.delete(key)
      recent.delete(key)
      continue
    }
    const list = recent.get(key) ?? []
    if (a.answer) list.push(a.answer)
    recent.set(key, list.slice(-3))
    if (a.feedback === TAG_HELP) {
      open.set(key, {
        key,
        student_id: a.student_id,
        unit_id: a.unit_id,
        item_id: a.item_id,
        target: a.target,
        answers: recent.get(key) ?? [],
        last_id: a.id,
      })
    } else if (open.has(key)) {
      open.get(key)!.answers = recent.get(key) ?? []
    }
  }
  return [...open.values()].sort((a, b) => a.last_id - b.last_id)
}
