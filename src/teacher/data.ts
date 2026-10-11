import { UNITS, ITEM_INDEX, unitById, unitLabel } from '../data/curriculum'
import { genderName, jobById } from '../data/items'
import { keyJong } from '../lib/hangul'
import { type Growth, STATUS_LABEL } from '../lib/growth'
import { type HelpRequest, pendingHelp } from '../lib/helpTags'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/util'

export interface ClassRow {
  id: string
  name: string
  code: string
  student_count: number
  created_at: string
}

export interface StudentRow {
  id: string
  class_id: string
  number: number
  character: string | null
  job: string | null
  dream_total: number
  items: string[]
  created_at: string
}

export interface ProgressRow {
  student_id: string
  unit_id: string
  level: 'word' | 'sentence' | 'paragraph'
  first_try_correct: number
  total: number
  passed: boolean
}

export interface AttemptRow {
  id: number
  student_id: string
  class_id: string
  level: 'word' | 'sentence' | 'paragraph'
  unit_id: string
  item_id: string
  target: string
  answer: string | null
  is_correct: boolean
  first_try: boolean
  similarity: number | null
  listened_first: boolean | null
  feedback: string | null
  created_at: string
}

/** Supabase 는 한 번에 1000행까지만 주므로 나눠서 모두 가져온다 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  return out
}

export async function loadClassData(classId: string) {
  const students = await fetchAll<StudentRow>((a, b) =>
    supabase.from('students').select('*').eq('class_id', classId).order('number').range(a, b),
  )
  const ids = students.map((s) => s.id)
  const progress = ids.length
    ? await fetchAll<ProgressRow>((a, b) => supabase.from('progress').select('*').in('student_id', ids).range(a, b))
    : []
  const attempts = await fetchAll<AttemptRow>((a, b) =>
    supabase.from('attempts').select('*').eq('class_id', classId).order('id', { ascending: true }).range(a, b),
  )
  return { students, progress, attempts }
}

export const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

// 선생님 확인 대기 목록 계산은 서버와 무관해서 lib/helpTags.ts 에 있다 (점검 스크립트에서도 쓴다)
export { pendingHelp, type HelpRequest }

export interface StudentStat {
  student: StudentRow
  charName: string
  jobLabel: string
  currentUnit: string
  currentIdx: number
  wordRate: number | null
  sentRate: number | null
  readPassed: number // 읽기 테스트(두루책방)에서 통과한 책 수
  help: number
}

export function computeStats(students: StudentRow[], progress: ProgressRow[], attempts: AttemptRow[]): StudentStat[] {
  const pending = pendingHelp(attempts)
  return students.map((s) => {
    const rows = progress.filter((p) => p.student_id === s.id)
    const passed = (unit: string, level: string) => rows.some((r) => r.unit_id === unit && r.level === level && r.passed)
    const sum = (level: string) => {
      const r = rows.filter((x) => x.level === level)
      return rate(
        r.reduce((a, x) => a + x.first_try_correct, 0),
        r.reduce((a, x) => a + x.total, 0),
      )
    }
    let currentUnit = '시작 전'
    let currentIdx = 0
    const nextUnit = UNITS.findIndex((u) => !(passed(u.id, 'word') && passed(u.id, 'sentence')))
    if (nextUnit >= 0) {
      currentUnit = UNITS[nextUnit].id
      currentIdx = nextUnit
    } else {
      currentUnit = '완료'
      currentIdx = UNITS.length
    }
    const help = pending.filter((r) => r.student_id === s.id).length // 지금 선생님 확인을 기다리는 문장 수
    return {
      student: s,
      charName: genderName(s.character),
      jobLabel: jobById(s.job)?.label ?? '-',
      currentUnit,
      currentIdx,
      wordRate: sum('word'),
      sentRate: sum('sentence'),
      readPassed: rows.filter((r) => r.level === 'paragraph' && r.passed && r.unit_id.startsWith('read-')).length,
      help,
    }
  })
}

/** 학급 전체에서 자주 틀린 받침 TOP N */
export function topWrongBatchim(attempts: AttemptRow[], n = 5) {
  const counts = new Map<string, { count: number; examples: Set<string> }>()
  for (const a of attempts) {
    if (a.level === 'paragraph' || a.is_correct) continue
    const info = ITEM_INDEX[a.item_id]
    if (!info) continue
    const jong = keyJong(info.text, info.pron)
    if (!jong) continue
    const e = counts.get(jong) ?? { count: 0, examples: new Set<string>() }
    e.count++
    e.examples.add(info.text)
    counts.set(jong, e)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
    .map(([jong, v]) => ({ jong, count: v.count, examples: [...v.examples].slice(0, 3) }))
}

const levelLabel = { word: '단어', sentence: '문장', paragraph: '문단' } as const

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 붙인 CSV */
export function buildCsv(students: StudentRow[], attempts: AttemptRow[]): string {
  const num = new Map(students.map((s) => [s.id, s.number]))
  const header = ['번호', '단계', '단원', '문제', '학생 답', '정답 여부', '첫 시도 여부', '유사도', '피드백', '날짜']
  const rows = [...attempts]
    .sort((a, b) => (num.get(a.student_id) ?? 0) - (num.get(b.student_id) ?? 0) || a.id - b.id)
    .map((a) => [
      num.get(a.student_id) ?? '',
      levelLabel[a.level],
      unitLabel(a.unit_id),
      a.target,
      a.answer ?? '',
      a.is_correct ? 'O' : 'X',
      a.first_try ? 'O' : 'X',
      a.similarity === null || a.similarity === undefined ? '' : Math.round(Number(a.similarity) * 100) + '%',
      a.feedback ?? '',
      fmtDate(a.created_at),
    ])
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export { unitById, unitLabel }

/** 성장 요약 CSV: 학생 한 명이 한 줄. 이름은 쓰지 않고 번호만 쓴다 */
export function buildGrowthCsv(students: StudentRow[], stats: StudentStat[], growth: Map<string, Growth>): string {
  const header = [
    '번호', '현재 단원', '지도 상태', '전체 첫 시도 정답률(%)', '단어 첫 시도 정답률(%)', '문장 첫 시도 정답률(%)',
    '최근 학습일', '최근 3회 변화', '어려워하는 받침', '읽기 확인 필요', '읽기 확인 대기 문장 수', '한 줄 요약',
  ]
  const byId = new Map(stats.map((s) => [s.student.id, s]))
  const rows = [...students]
    .sort((a, b) => a.number - b.number)
    .map((st) => {
      const g = growth.get(st.id)
      const s = byId.get(st.id)
      if (!g || !s) return [st.number, '', '', '', '', '', '', '', '', '', '', '']
      const last = g.lastStudyMs === null ? '' : fmtDate(new Date(g.lastStudyMs).toISOString()).slice(0, 10)
      return [
        st.number,
        s.currentUnit,
        STATUS_LABEL[g.status].text,
        g.overall ?? '',
        s.wordRate ?? '',
        s.sentRate ?? '',
        last,
        g.recentDays.length >= 2 ? g.recentDays.map((p) => `${p.rate}%`).join(' → ') : '기록 적음',
        g.hardGroups.map((x) => x.group.label).join(' / '),
        g.reading.pending > 0 || g.reading.needCheck > 0 ? '예' : '아니오',
        g.reading.pending,
        g.summary,
      ]
    })
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}
