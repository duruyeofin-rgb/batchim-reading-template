import { UNITS, type Unit } from '../data/curriculum'
import type { GProgress } from '../lib/growth'
import { elemsOfJob } from '../data/dreamWorld'

export const CHECKPOINTS = UNITS.filter((_, i) => (i + 1) % 4 === 0)
export const isCheckpoint = (id: string) => CHECKPOINTS.some(u => u.id === id)
export function checkpointUnits(unit: Unit) {
  const end = UNITS.findIndex(u => u.id === unit.id)
  return isCheckpoint(unit.id) ? UNITS.slice(end - 3, end + 1) : [unit]
}
export const checkpointLabel = (id: string) => `${CHECKPOINTS.findIndex(u => u.id === id) + 1}차 중간 평가`
export const checkpointEligible = (unit: Unit, rows: GProgress[]) => isCheckpoint(unit.id) &&
  checkpointUnits(unit).every(u => ['word', 'sentence'].every(level => rows.some(p => p.unit_id === u.id && p.level === level && p.passed)))
export const nextMissionTool = (job: string | null, items: string[]) =>
  elemsOfJob(job).find(e => e.kind === 'tool' && !items.includes(e.id)) ?? null
