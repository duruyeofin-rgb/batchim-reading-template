// 직업 29개의 그림 자료: 직업마다 옷차림 3벌·도구 5개·배경 3개 이미지가 public/dream/ 에 있다.
// 학생에게 열어 주는 요소(내 모습·일하는 도구·일하는 곳)와 직업 정보 문장은 dreamWorld.ts / jobs-world.json 에서 정한다.
import jobsJson from './jobs.json'
import extraJson from './jobs-extra.json'

export type Slot = 'outfit' | 'tool' | 'bg'

// 캐릭터는 남자·여자 두 가지. 직업 옷차림 그림이 성별마다 따로 있다.
export type Gender = 'boy' | 'girl'
export const GENDERS: { id: Gender; name: string }[] = [
  { id: 'boy', name: '남자 친구' },
  { id: 'girl', name: '여자 친구' },
]
export const isGender = (v: string | null | undefined): v is Gender => v === 'boy' || v === 'girl'
export const genderOf = (v: string | null | undefined): Gender => (v === 'girl' ? 'girl' : 'boy')
export const genderName = (v: string | null | undefined) => GENDERS.find((g) => g.id === v)?.name ?? '-'

export interface JobDef {
  id: string
  label: string
  emoji: string
  desc: string // 하는 일 (초등 저학년 눈높이)
}

export const JOBS: JobDef[] = (jobsJson as (JobDef & Record<string, string>)[]).map(({ id, label, emoji, desc }) => ({
  id, label, emoji, desc,
}))
export const jobById = (id: string | null | undefined) => JOBS.find((j) => j.id === id)

export interface Item {
  id: string // 예: doctor-tool-2
  job: string
  slot: Slot
  idx: number
  name: string
}

type Extra = Record<string, { tools: string[][]; bgs: string[][]; outfits: string[][] }>
const EXTRA = extraJson as Extra

export const ITEMS: Item[] = (jobsJson as Record<string, string>[]).flatMap((j) => {
  const x = EXTRA[j.id] ?? { tools: [], bgs: [], outfits: [] }
  const mk = (slot: Slot, names: string[]) =>
    names.map((name, idx): Item => ({ id: `${j.id}-${slot}-${idx}`, job: j.id, slot, idx, name }))
  return [
    ...mk('outfit', [j.outfitName, ...x.outfits.map((o) => o[0])]),
    ...mk('tool', [j.toolName, ...x.tools.map((o) => o[0])]),
    ...mk('bg', [j.bgName, ...x.bgs.map((o) => o[0])]),
  ]
})

const ITEM_MAP = new Map(ITEMS.map((i) => [i.id, i]))
export const itemById = (id: string | null | undefined) => (id ? ITEM_MAP.get(id) : undefined)
export const itemsOfJob = (jobId: string) => ITEMS.filter((i) => i.job === jobId)

// ───────── 그림 주소 ─────────
export const imgBase = (g: Gender) => `/dream/base-${g}.webp`
export const imgFigure = (job: string, g: Gender, idx = 0) => `/dream/${job}-outfit-${idx}-${g}.webp`
/** 도구를 n개(1~3) 들거나 쓴 모습 (열린 도구가 늘어날 때마다 캐릭터가 하나씩 더 갖는다) */
export const imgKit = (job: string, g: Gender, n: number) => `/dream/${job}-kit-${n}-${g}.webp`
export const imgTool = (job: string, idx = 0) => `/dream/${job}-tool-${idx}.webp`
export const imgBg = (job: string, idx = 0) => `/dream/${job}-bg-${idx}.webp`

