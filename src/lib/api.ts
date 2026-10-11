// 학생 화면에서 쓰는 Supabase 호출 모음
import { TAG_PASS, TEACHER_TAGS } from './helpTags'
import { enqueue } from './queue'
import { supabase } from './supabase'

export interface Student {
  id: string
  class_id: string
  number: number
  character: string | null
  job: string | null
  dream_total: number
  items: string[]
  equipped: Record<string, string>
}

export interface ProgressRow {
  student_id: string
  unit_id: string
  level: 'word' | 'sentence' | 'paragraph'
  first_try_correct: number
  total: number
  passed: boolean
}

export const LOGIN_KEY = 'batchim.login.v1'

/** 예전 버전이 저장한 자동 입장 정보만 지운다. 학습 기록·로그인 세션은 유지한다. */
export const clearSavedLogin = () => {
  try {
    localStorage.removeItem(LOGIN_KEY)
  } catch {
    /* 저장소 접근이 막혀 있어도 코드 입력으로 입장할 수 있다. */
  }
}

/** 익명 로그인 세션을 보장한다 (교사 로그인 상태면 그대로 쓰지 않고 학생용으로 새로 만든다) */
export async function ensureAnonymous() {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (user?.is_anonymous) return
  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
}

export async function getClassSize(code: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('class_size', { p_code: code })
  if (error) throw error
  return (data as number | null) ?? null
}

export async function joinClass(code: string, number: number): Promise<Student> {
  const { data, error } = await supabase.rpc('join_class', { p_code: code, p_number: number })
  if (error) throw error
  const s = data as Student
  return { ...s, items: s.items ?? [], equipped: s.equipped ?? {} }
}

export async function fetchProgress(studentId: string): Promise<ProgressRow[]> {
  const { data, error } = await supabase.from('progress').select('*').eq('student_id', studentId)
  if (error) throw error
  return (data ?? []) as ProgressRow[]
}

/** 이미 첫 시도에 맞혀 꿈을 받은 문항 번호들 */
export async function fetchEarnedItems(studentId: string, unitId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('attempts')
    .select('item_id')
    .eq('student_id', studentId)
    .eq('unit_id', unitId)
    .eq('first_try', true)
    .eq('is_correct', true)
  return new Set((data ?? []).map((r: { item_id: string }) => r.item_id))
}

export interface AttemptInput {
  student_id: string
  class_id: string
  level: 'word' | 'sentence' | 'paragraph'
  unit_id: string
  item_id: string
  target: string
  answer: string | null
  is_correct: boolean
  first_try: boolean
  similarity?: number | null
  listened_first?: boolean
  feedback?: string | null
}

/** 이 문장에 대해 선생님이 남긴 마지막 결정의 번호(없으면 0). 기다리기 시작할 때 기준으로 쓴다 */
export async function latestTeacherDecisionId(studentId: string, itemId: string): Promise<number> {
  const { data } = await supabase
    .from('attempts')
    .select('id')
    .eq('student_id', studentId)
    .eq('item_id', itemId)
    .in('feedback', TEACHER_TAGS)
    .order('id', { ascending: false })
    .limit(1)
  return (data?.[0]?.id as number | undefined) ?? 0
}

/** 기준 번호보다 새로운 선생님 결정이 있는지: 'pass'(통과) | 'skip'(넘어가기) | null(아직) */
export async function fetchTeacherDecision(
  studentId: string,
  itemId: string,
  afterId: number,
): Promise<'pass' | 'skip' | null> {
  const { data, error } = await supabase
    .from('attempts')
    .select('id, feedback')
    .eq('student_id', studentId)
    .eq('item_id', itemId)
    .in('feedback', TEACHER_TAGS)
    .gt('id', afterId)
    .order('id', { ascending: false })
    .limit(1)
  if (error || !data?.length) return null
  return data[0].feedback === TAG_PASS ? 'pass' : 'skip'
}

export const saveAttempt = (row: AttemptInput) =>
  enqueue({ k: 'attempt', row: { ...row, created_at: new Date().toISOString() } })

export const saveProgress = (row: ProgressRow) =>
  enqueue({ k: 'progress', row: { ...row, updated_at: new Date().toISOString() } })

export const patchStudent = (id: string, patch: Partial<Omit<Student, 'id' | 'class_id' | 'number'>>) =>
  enqueue({ k: 'student', id, patch: { ...patch, updated_at: new Date().toISOString() } })


// ───────── 나의 꿈 이야기 (꿈 완성 화면에서 학생이 쓰는 한 문장) ─────────
export const WISH_MAX = 120

type DbError = { code?: string; message?: string } | null
/** dream_wishes 표가 아직 없는 오류인가 (표가 없으면 글쓰기 칸을 보이지 않는다) */
export const wishTableMissing = (e: DbError) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/dream_wishes/.test(e.message ?? '') && /exist|schema cache/i.test(e.message ?? '')))

export async function fetchWish(studentId: string, job: string): Promise<{ wish: string | null; missing: boolean }> {
  const { data, error } = await supabase.from('dream_wishes').select('wish').eq('student_id', studentId).eq('job', job).maybeSingle()
  if (error) return { wish: null, missing: wishTableMissing(error) }
  return { wish: (data as { wish: string } | null)?.wish ?? null, missing: false }
}

export async function saveWish(studentId: string, classId: string, job: string, wish: string): Promise<{ ok: boolean; missing: boolean }> {
  const { error } = await supabase
    .from('dream_wishes')
    .upsert(
      { student_id: studentId, class_id: classId, job, wish: wish.trim().slice(0, WISH_MAX), updated_at: new Date().toISOString() },
      { onConflict: 'student_id,job' },
    )
  return { ok: !error, missing: wishTableMissing(error) }
}

// ───────── QR 입장과 서버 상태 확인 ─────────
/** 내 학생 기록을 서버에서 다시 읽는다 (교사가 초기화했는지 알아보는 데 쓴다). 못 읽으면 null */
export async function fetchOwnStudent(id: string): Promise<Student | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, class_id, number, character, job, dream_total, items, equipped')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const s = data as Student
  return { ...s, items: s.items ?? [], equipped: s.equipped ?? {} }
}
