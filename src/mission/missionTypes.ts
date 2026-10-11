import type { Question } from '../lib/quiz'

export type MissionKind = 'rescue' | 'treasure' | 'train'
export type MissionStatus = 'started' | 'completed' | 'skipped'
export interface MissionChoice {
  kind: MissionKind
  reason: string
  focusIds: string[]
  successIds: string[]
}
export interface MissionResult {
  item_id: string
  first_correct: boolean | null
  hint_used: boolean
  resolved: boolean
  tries: number
  continued: boolean
}
export interface MissionRun {
  assessment?: boolean // 교사 표시 전용; 서버 저장에는 포함하지 않음
  student_id: string
  class_id: string
  unit_id: string
  epoch: string
  kind: MissionKind
  reason: string
  status: MissionStatus
  item_ids: string[]
  results: MissionResult[]
  revision: number
  started_at: string
  updated_at: string
}
export interface MissionDraft {
  run: MissionRun
  questions: Question[]
  dirty: boolean
}
export const MISSION_NAMES: Record<MissionKind, string> = {
  rescue: '몬스터 구출',
  treasure: '보물상자 열기',
  train: '병원 열차 출발',
}
export const emptyResult = (item_id: string): MissionResult => ({
  item_id,
  first_correct: null,
  hint_used: false,
  resolved: false,
  tries: 0,
  continued: false,
})
export const finishedQuestion = (r: MissionResult) => r.resolved || r.continued
/** A double click on an already solved question has no effect. A hint before answering is recorded separately. */
export function answerResult(r: MissionResult, correct: boolean): MissionResult {
  if (finishedQuestion(r)) return r
  return {
    ...r,
    first_correct: r.first_correct ?? correct,
    tries: r.tries + 1,
    resolved: correct,
    hint_used: r.hint_used || !correct,
  }
}
