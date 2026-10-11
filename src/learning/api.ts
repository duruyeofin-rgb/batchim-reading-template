import { flush, pendingCount } from '../lib/queue'
import { supabase } from '../lib/supabase'
import { isStaleStateError } from '../lib/staleState'
export interface LearningResult {
  id: string
  skill: string
  first: boolean
  passed: boolean
  helped: boolean
}
export interface ReviewSchedule {
  unit_id: string
  due_on: string | null
  anchor_on: string
  stage: number
  round: number
  weak: string[]
}
export interface LearningContext {
  epoch: string
  schedules: ReviewSchedule[]
  practice: string[]
  stories: string[]
}
export interface Submission {
  id: string
  student: string
  epoch: string
  unit: string
  kind: 'practice' | 'review' | 'story'
  round: number
  results: LearningResult[]
  reflection: string
}
export async function learningContext(student: string): Promise<LearningContext> {
  const { data, error } = await supabase.rpc('learning_context', { p_student: student }).abortSignal(AbortSignal.timeout(5000))
  if (error) throw error
  saveLocal(contextKey(student), data)
  return data
}
export async function submitLearning(s: Submission): Promise<void> {
  await flush()
  if (pendingCount() > 0) throw new Error('기존 학습 기록 전송 중')
  const { error } = await supabase.rpc('submit_learning', {
    p_id: s.id,
    p_student: s.student,
    p_epoch: s.epoch,
    p_unit: s.unit,
    p_kind: s.kind,
    p_round: s.round,
    p_results: s.results,
    p_reflection: s.reflection,
  }).abortSignal(AbortSignal.timeout(8000))
  if (error) throw error
}
export const draftKey = (student: string, unit: string, kind: string) =>
  `batchim.learning.v1:${student}:${unit}:${kind}`
export function loadLocal<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
export function clearLocal(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

// Store one immutable submission per key before navigating. Retry only for the active student.
const contextKey = (student: string) => `batchim.learning.context.v1:${student}`
export const cachedLearningContext = (student: string) => loadLocal<LearningContext>(contextKey(student))
const pendingPrefix = (student: string) => `batchim.learning.pending.v1:${student}:`
const pendingKey = (s: Submission) => pendingPrefix(s.student) + s.id
export function pendingLearning(student: string): Submission[] {
  try {
    return Object.keys(localStorage).filter(k => k.startsWith(pendingPrefix(student)))
      .map(k => loadLocal<Submission>(k)).filter((s): s is Submission => !!s && s.student === student)
  } catch { return [] }
}
export function hasPendingLearning(student: string, unit: string, kind: Submission['kind'], epoch?: string, round?: number) {
  return pendingLearning(student).some(s => s.unit === unit && s.kind === kind && (!epoch || s.epoch === epoch) && (round === undefined || s.round === round))
}
export async function saveLearningAndContinue(s: Submission): Promise<void> {
  if (!saveLocal(pendingKey(s), s)) {
    // If device storage is unavailable, only leave after the server confirms the result.
    await submitLearning(s)
    return
  }
  void retryLearning(s.student)
}
const syncing = new Map<string, Promise<void>>()
export function retryLearning(student: string): Promise<void> {
  const running = syncing.get(student)
  if (running) return running
  const task = (async () => {
    if (!pendingLearning(student).length) return
    try {
      await flush()
      if (pendingCount()) return
      const ctx = await learningContext(student)
      for (const s of pendingLearning(student)) {
        if (s.epoch !== ctx.epoch) {
          // Teacher reset: never attach an old answer to a new learning generation.
          clearLocal(pendingKey(s))
          continue
        }
        try {
          await submitLearning(s)
          clearLocal(pendingKey(s))
        } catch (e) {
          // Another device can finish this review round first. Other failures retain the answer.
          if (isStaleStateError(e)) {
            const fresh = await learningContext(student)
            const schedule = fresh.schedules.find(r => r.unit_id === s.unit)
            if (fresh.epoch !== s.epoch || (s.kind === 'review' && schedule && schedule.round > s.round))
              clearLocal(pendingKey(s))
          }
          break
        }
      }
    } catch { /* Retry on reconnect, on entry, or at the next interval. */ }
  })().finally(() => syncing.delete(student))
  syncing.set(student, task)
  return task
}
