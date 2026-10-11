import { supabase } from '../lib/supabase'
import { CHECKPOINTS } from './checkpoints'
import type { Student } from '../lib/api'
import { flush, pendingCount } from '../lib/queue'
import { isStaleStateError } from '../lib/staleState'
import type { GAttempt } from '../lib/growth'
import { questionById } from './missionQuestions'
import { clearDraft, readDraft, reconcileDraft, sameMissionPlan, writeDraft } from './missionStore'
import type { MissionDraft, MissionRun } from './missionTypes'

// Bound requests so a dropped connection can be retried without blocking the lesson.
const requestSignal = () => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 8000)
  return controller.signal
}

type ErrorLike = { code?: string; message?: string } | null
export const missionUnavailable = (e: ErrorLike) =>
  !!e && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(e.code ?? '')
export async function missionContext(studentId: string, unitId: string) {
  const { data, error } = await supabase
    .rpc('checkpoint_context', { p_student_id: studentId, p_unit_id: unitId })
    .abortSignal(requestSignal())
  if (error) throw error
  return data as { epoch: string; run: MissionRun | null; eligible: boolean }
}
export async function loadMission(studentId: string, unitId: string) {
  const context = await missionContext(studentId, unitId)
  const local = readDraft(studentId, unitId)
  if (!context.eligible) {
    clearDraft(studentId, unitId)
    return { ...context, draft: null }
  }
  let draft = reconcileDraft(local, context.epoch, context.run)
  if (!draft && context.run) {
    const questions = context.run.item_ids.map(questionById)
    if (questions.every((q) => !!q)) draft = { run: context.run, questions, dirty: false }
  }
  if (draft && draft.run.item_ids.some((id, i) => draft?.questions[i]?.id !== id)) {
    const questions = draft.run.item_ids.map(questionById)
    if (questions.every((q) => !!q)) draft = { ...draft, questions }
    else draft = null
  }
  if (draft) writeDraft(draft)
  else if (local) clearDraft(studentId, unitId)
  return { ...context, draft }
}
// One request at a time per student/unit. A fresh local snapshot is read after every response.
const syncing = new Map<string, Promise<'saved' | 'pending' | 'reset'>>()
export function syncMission(studentId: string, unitId: string): Promise<'saved' | 'pending' | 'reset'> {
  const key = `${studentId}:${unitId}`
  const existing = syncing.get(key)
  if (existing) return existing
  const task = (async () => {
    try {
      const context = await missionContext(studentId, unitId)
      const draft = readDraft(studentId, unitId)
      if (!draft) return 'saved' as const
      if (!context.eligible || context.epoch !== draft.run.epoch) {
        clearDraft(studentId, unitId)
        return 'reset' as const
      }
      if (
        context.run &&
        (!sameMissionPlan(draft.run, context.run) ||
          context.run.status !== 'started' ||
          context.run.revision >= draft.run.revision)
      ) {
        const questions = context.run.item_ids.map(questionById)
        if (questions.every((q) => !!q))
          writeDraft({
            ...draft,
            questions: draft.run.item_ids.join() === context.run.item_ids.join() ? draft.questions : questions,
            run: context.run,
            dirty: false,
          })
        return 'saved' as const
      }
      if (!draft.dirty) return 'saved' as const
      const { error } = await supabase
        .from('checkpoint_runs')
        .upsert(draft.run, { onConflict: 'student_id,unit_id' })
        .abortSignal(requestSignal())
      if (error) {
        if (isStaleStateError(error)) {
          const fresh = await missionContext(studentId, unitId)
          if (!fresh.eligible || fresh.epoch !== draft.run.epoch) {
            clearDraft(studentId, unitId)
            return 'reset' as const
          }
        }
        return 'pending' as const
      }
      // Read back authoritative data: server may ignore a stale or terminal overwrite.
      const after = await missionContext(studentId, unitId)
      const current = readDraft(studentId, unitId)
      if (!current) return 'saved' as const
      if (after.epoch !== current.run.epoch) {
        clearDraft(studentId, unitId)
        return 'reset' as const
      }
      if (
        after.run &&
        (!sameMissionPlan(current.run, after.run) ||
          after.run.status !== 'started' ||
          current.run.revision <= after.run.revision)
      ) {
        const questions = after.run.item_ids.map(questionById)
        if (questions.every((q) => !!q))
          writeDraft({
            ...current,
            run: after.run,
            questions: current.run.item_ids.join() === after.run.item_ids.join() ? current.questions : questions,
            dirty: false,
          })
      }
      return readDraft(studentId, unitId)?.dirty ? ('pending' as const) : ('saved' as const)
    } catch {
      return 'pending' as const
    }
  })().finally(() => syncing.delete(key))
  syncing.set(key, task)
  return task
}
const receivedRewards = new Set<string>()
export async function retryStudentMissions(studentId: string) {
  for (const u of CHECKPOINTS) {
    if (readDraft(studentId, u.id)?.dirty) await syncMission(studentId, u.id)
    const draft = readDraft(studentId, u.id)
    const key = `${studentId}:${u.id}:${draft?.run.epoch}`
    if (draft && !draft.dirty && draft.run.status === 'completed' && !receivedRewards.has(key)) {
      try {
        await claimMissionReward(draft.run)
        receivedRewards.add(key)
      } catch (e) {
        // 초기화된 옛 기록으로 같은 요청을 계속 보내지 않도록 비운다. 그 밖의 오류는 재접속 때 다시 시도한다.
        if (isStaleStateError(e)) await syncMission(studentId, u.id)
      }
    }
  }
}
export async function missionHistory(studentId: string): Promise<GAttempt[]> {
  const { data, error } = await supabase
    .from('attempts')
    .select('id,student_id,level,unit_id,item_id,target,answer,is_correct,first_try,feedback,created_at')
    .eq('student_id', studentId)
    .in('level', ['word', 'sentence'])
    .order('id', { ascending: false })
    .limit(1000)
    .abortSignal(requestSignal())
  if (error) throw error
  return (data ?? []).reverse() as GAttempt[]
}
export async function teacherMissions(studentId: string) {
  const { data, error } = await supabase
    .from('checkpoint_runs')
    .select('*')
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false })
    .abortSignal(requestSignal())
  if (error) throw error
  const { data: legacy } = await supabase.from('mission_runs').select('*').eq('student_id', studentId).abortSignal(requestSignal())
  return [...(data ?? []).map(r => ({...r, assessment: true})), ...(legacy ?? [])] as MissionRun[]
}

export async function claimMissionReward(run: MissionRun) {
  // Finish earlier dream-box writes before the server atomically adds a tool.
  await flush()
  if (pendingCount() > 0) throw new Error('학습 기록을 먼저 저장하고 있어요.')
  const { data, error } = await supabase.rpc('claim_checkpoint_reward', {
    p_student_id: run.student_id, p_unit_id: run.unit_id, p_epoch: run.epoch,
  }).abortSignal(requestSignal())
  if (error) throw error
  return data as { item_id: string | null; job: string; student: Student }
}
