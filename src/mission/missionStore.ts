import type { MissionDraft, MissionRun } from './missionTypes'

const PREFIX = 'batchim.checkpoint.v1:'
export const missionKey = (studentId: string, unitId: string) => `${PREFIX}${studentId}:${unitId}`
const memory = new Map<string, MissionDraft | null>()
export function readDraft(studentId: string, unitId: string): MissionDraft | null {
  const k = missionKey(studentId, unitId)
  if (memory.has(k)) return memory.get(k) ?? null
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as MissionDraft | null
    if (
      v?.run.student_id === studentId &&
      v.run.unit_id === unitId &&
      [4, 12].includes(v.questions.length) &&
      v.run.results.length === v.questions.length
    )
      return v
  } catch {
    /* private browsing / unavailable storage */
  }
  return memory.get(k) ?? null
}
export function writeDraft(d: MissionDraft): boolean {
  const k = missionKey(d.run.student_id, d.run.unit_id)
  try {
    localStorage.setItem(k, JSON.stringify(d))
    memory.delete(k)
    return true
  } catch {
    memory.set(k, d)
    return false
  }
}
export function clearDraft(studentId: string, unitId: string) {
  const k = missionKey(studentId, unitId)
  try {
    localStorage.removeItem(k)
    memory.delete(k)
  } catch {
    memory.set(k, null)
  }
}
/** An epoch change is authoritative: an old offline run must never be uploaded after a teacher reset. */
export function reconcileDraft(
  local: MissionDraft | null,
  epoch: string,
  remote: MissionRun | null,
): MissionDraft | null {
  if (local?.run.epoch !== epoch) return null
  if (
    remote &&
    (!sameMissionPlan(local.run, remote) || remote.status !== 'started' || remote.revision >= local.run.revision)
  )
    return { ...local, run: remote, dirty: false }
  return local
}

export const sameMissionPlan = (a: MissionRun, b: MissionRun) =>
  a.kind === b.kind &&
  a.reason === b.reason &&
  a.item_ids.join() === b.item_ids.join() &&
  new Date(a.started_at).getTime() === new Date(b.started_at).getTime()
