import { UNITS, type Unit, activeWords, wordItemId } from '../data/curriculum'
import { analyzeGrowth, type GAttempt, type GProgress } from '../lib/growth'
import { checkpointUnits, isCheckpoint } from './checkpoints'
import type { MissionChoice } from './missionTypes'

/** Only the current unit and already completed, related prerequisites can supply focus words. */
export function selectMission(
  unit: Unit,
  attempts: GAttempt[],
  progress: GProgress[],
  currentWrong: string[] = [],
): MissionChoice {
  const at = UNITS.findIndex((u) => u.id === unit.id)
  const related = UNITS.filter(
    (u, i) =>
      i < at &&
      progress.some((p) => p.unit_id === u.id && p.level === 'sentence' && p.passed) &&
      progress.some((p) => p.unit_id === u.id && p.level === 'word' && p.passed) &&
      ((u.sound === unit.sound && !!u.sound) || u.jamos.split(' ').some((j) => unit.jamos.split(' ').includes(j))),
  )
  const allowed = isCheckpoint(unit.id) ? checkpointUnits(unit) : [unit, ...related.reverse()]
  const rows = attempts.filter(
    (a) => allowed.some((u) => u.id === a.unit_id) && (a.level === 'word' || a.level === 'sentence'),
  )
  const growth = analyzeGrowth(rows, progress)
  const focusIds: string[] = []
  for (const u of allowed) {
    const group = growth.groups.find((g) => g.group.id === u.id)
    // growth.ts counts different sessions and removes targets subsequently answered correctly.
    const targets = [...(group?.stuckTargets ?? []), ...(group?.repeatTargets ?? [])]
    for (const target of targets) {
      const word = activeWords(u).find(({ w }) => w.text === target)
      if (word) focusIds.push(wordItemId(u, word.i))
    }
  }
  let reason = '기록으로 취약점을 판단하지 않고 완료한 네 단원의 공통 복습을 제공합니다.'
  if (focusIds.length)
    reason = '현재 단원 또는 이미 통과한 관련 단원에서 서로 다른 학습 회차에 반복된 첫 시도 오류를 복습합니다.'
  else {
    const active = new Set(activeWords(unit).map(({ i }) => wordItemId(unit, i)))
    focusIds.push(...currentWrong.filter((id) => active.has(id)))
    if (focusIds.length)
      reason = '이번 낱말 학습에서 첫 시도에 어려웠던 낱말을 다시 만납니다. 반복 오류로 판단하지 않습니다.'
    else if (growth.wordSentGap) reason = '충분한 낱말·문장 기록에서 수행 차이가 관찰되어 문장 속 낱말을 연습합니다.'
  }
  const latest = new Map<string, GAttempt>()
  for (const a of [...rows].sort((a, b) => a.id - b.id)) if (a.first_try) latest.set(a.item_id, a)
  const successIds = [...latest.values()].filter((a) => a.is_correct && a.unit_id === unit.id).map((a) => a.item_id)
  return {
    kind: growth.wordSentGap && !focusIds.length ? 'train' : unit.part === 2 ? 'treasure' : 'rescue',
    reason,
    focusIds: [...new Set(focusIds)],
    successIds,
  }
}
