import { createContext, useContext } from 'react'
import { UNITS } from '../data/curriculum'
import type { WorldState } from '../data/dreamWorld'
import type { ProgressRow, Student } from '../lib/api'

export interface StudentCtx {
  student: Student
  progress: Map<string, ProgressRow>
  /** 이 꿈(직업) 세계에서 열린 것과 다음 조건 */
  world: WorldState
  /** 처음 시도에 맞혔을 때 꿈 1개 */
  earnDream: () => void
  updateStudent: (patch: Partial<Omit<Student, 'id' | 'class_id' | 'number'>>) => void
  setProgressRow: (row: ProgressRow) => void
  refreshStudent: () => Promise<void>
}

export const Ctx = createContext<StudentCtx | null>(null)
export const useStu = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('StudentCtx missing')
  return c
}

export const pkey = (unitId: string, level: string) => `${unitId}|${level}`

export const isPassed = (p: Map<string, ProgressRow>, unitId: string, level: string) =>
  p.get(pkey(unitId, level))?.passed === true

export const unitPassed = (p: Map<string, ProgressRow>, unitId: string) =>
  isPassed(p, unitId, 'word') && isPassed(p, unitId, 'sentence')

export const unitOpen = (p: Map<string, ProgressRow>, idx: number) => idx === 0 || unitPassed(p, UNITS[idx - 1].id)

export const allUnitsPassed = (p: Map<string, ProgressRow>) => UNITS.every((u) => unitPassed(p, u.id))
