// 꿈 세계: 학생이 고른 직업의 세계를 하나씩 알아가며 완성하는 흐름.
//
//   받침 학습 → 별 → 꿈 도구 열기 → 짧은 직업 정보 → 이야기 읽기 → 다음 요소 열기 → 나의 꿈 장면 완성
//
// - 별은 돈이 아니다. 모아도 줄어들지 않고, 정해진 별(과 이야기 읽기)이 채워지면 다음 요소가 열린다.
// - 직업마다 6개 요소가 정해진 순서로 열린다: 내 모습 1 · 일하는 도구 3 · 일하는 곳 2.
// - 각 요소에는 초등 1학년이 읽을 수 있는 직업 정보 한 문장이 붙는다 (jobs-world.json).
// - 열린 요소는 학생 기록의 items 에 요소 번호(예: pilot-tool-3)로 저장된다. DB 구조는 그대로다.
// - 별과 읽은 이야기 수는 직업과 상관없이 쌓이는 값이라, 직업을 바꿔도 그대로 인정된다.
import type { ProgressRow } from '../lib/api'
import worldJson from './jobs-world.json'
import { JOBS, type Slot, itemById } from './items'

export type Kind = 'me' | 'tool' | 'place'
export const KIND_LABEL: Record<Kind, string> = { me: '내 모습', tool: '일하는 도구', place: '일하는 곳' }
/** 기다리는 중 안내 / 열었을 때 안내 문구 (조사를 알맞게) */
export const KIND_WAIT: Record<Kind, string> = { me: '새로운 내 모습이 기다려요!', tool: '새로운 꿈 도구가 기다려요!', place: '새로운 일하는 곳이 기다려요!' }
export const KIND_FOUND: Record<Kind, string> = { me: '내 모습을 열었어요!', tool: '꿈 도구를 얻었어요!', place: '일하는 곳을 발견했어요!' }
/** 열기 버튼 문구 */
export const KIND_OPEN: Record<Kind, string> = { me: '내 모습 열기', tool: '꿈 도구 열기', place: '일하는 곳 발견하기' }

/** 열리는 순서와 조건: [종류, 필요한 별, 필요한 이야기 읽기(읽기 테스트 통과 책 수)] */
export const STEPS: [Kind, number, number][] = [
  ['me', 5, 0],
  ['tool', 15, 0],
  ['tool', 30, 0],
  ['place', 50, 1],
  ['tool', 80, 1],
  ['place', 120, 2],
]
export const STEP_COUNT = STEPS.length

export interface Elem {
  id: string // 예: pilot-tool-3 (그림 번호와 같다)
  job: string
  kind: Kind
  slot: Slot
  idx: number // 그림 번호
  name: string
  fact: string // 직업 정보 한 문장
  order: number // 열리는 차례 (0부터)
  stars: number
  reads: number
}

type World = Record<string, { me: string; tools: [number, string, string][]; places: [number, string, string][] }>
const WORLD = worldJson as unknown as World

export const ELEMS: Elem[] = JOBS.flatMap((j) => {
  const w = WORLD[j.id]
  if (!w) return []
  // 순서: 내 모습 → 도구 → 도구 → 일하는 곳 → 도구 → 일하는 곳
  const seq: { kind: Kind; slot: Slot; idx: number; name: string; fact: string }[] = [
    { kind: 'me', slot: 'outfit', idx: 0, name: `나는 ${j.label}`, fact: w.me },
    { kind: 'tool', slot: 'tool', idx: w.tools[0][0], name: w.tools[0][1], fact: w.tools[0][2] },
    { kind: 'tool', slot: 'tool', idx: w.tools[1][0], name: w.tools[1][1], fact: w.tools[1][2] },
    { kind: 'place', slot: 'bg', idx: w.places[0][0], name: w.places[0][1], fact: w.places[0][2] },
    { kind: 'tool', slot: 'tool', idx: w.tools[2][0], name: w.tools[2][1], fact: w.tools[2][2] },
    { kind: 'place', slot: 'bg', idx: w.places[1][0], name: w.places[1][1], fact: w.places[1][2] },
  ]
  return seq.map((e, order) => ({
    ...e,
    id: `${j.id}-${e.slot}-${e.idx}`,
    job: j.id,
    order,
    stars: STEPS[order][1],
    reads: STEPS[order][2],
  }))
})

export const elemsOfJob = (job: string | null | undefined) => ELEMS.filter((e) => e.job === job)
const ELEM_MAP = new Map(ELEMS.map((e) => [e.id, e]))
export const elemById = (id: string | null | undefined) => (id ? ELEM_MAP.get(id) : undefined)

/** 통과한 읽기 테스트(두루책방) 책 수 */
export const readsPassed = (progress: Map<string, ProgressRow>) =>
  [...progress.values()].filter((p) => p.level === 'paragraph' && p.passed && p.unit_id.startsWith('read-')).length

// ───────── 지금 상태 ─────────
export interface WorldState {
  elems: Elem[]
  opened: Set<string>
  openedCount: number
  next: Elem | null // 다음에 열 요소 (모두 열었으면 null)
  starsIn: number // 모은 별
  readsIn: number // 통과한 이야기(책) 수
  needStars: number
  needReads: number
  canOpen: boolean
  complete: boolean
}

export function worldState(
  s: { job: string | null; dream_total: number; items: string[] },
  progress: Map<string, ProgressRow>,
): WorldState {
  const elems = elemsOfJob(s.job)
  const have = new Set(s.items)
  const opened = new Set(elems.filter((e) => have.has(e.id)).map((e) => e.id))
  const next = elems.find((e) => !opened.has(e.id)) ?? null
  // 별과 이야기 읽기는 공부한 만큼 쌓인 것이라, 직업을 바꿔도 그대로 인정한다
  const starsIn = s.dream_total
  const readsIn = readsPassed(progress)
  const needStars = next ? Math.max(0, next.stars - starsIn) : 0
  const needReads = next ? Math.max(0, next.reads - readsIn) : 0
  return {
    elems,
    opened,
    openedCount: opened.size,
    next,
    starsIn,
    readsIn,
    needStars,
    needReads,
    canOpen: !!next && needStars === 0 && needReads === 0,
    complete: elems.length > 0 && opened.size === elems.length,
  }
}

// ───────── 장면 (열린 것만 보인다) ─────────
export interface Scene {
  outfit?: string // 내 모습 (요소 번호)
  bg?: string // 일하는 곳 (가장 최근에 연 곳)
  tools: string[] // 일하는 도구들
}

export function sceneOf(job: string | null | undefined, items: string[]): Scene {
  const have = new Set(items)
  const opened = elemsOfJob(job).filter((e) => have.has(e.id))
  return {
    outfit: opened.find((e) => e.kind === 'me')?.id,
    bg: [...opened].reverse().find((e) => e.kind === 'place')?.id,
    tools: opened.filter((e) => e.kind === 'tool').map((e) => e.id),
  }
}

/** 요소 번호 → 그림 레이어용 Item 정보 */
export const sceneItem = (id: string | undefined) => itemById(id)
