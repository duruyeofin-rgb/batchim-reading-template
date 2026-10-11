// 보기 만들기: 1부는 실제 낱말끼리, 2부는 겹받침의 철자·발음 규칙을 비교한다.
//  - hear(소리 듣고 고르기): 소리가 다른 낱말만 보기로 쓴다 (같은 소리 철자는 들어서 구분할 수 없으므로)
//  - picture(그림 보고 고르기): 같은 소리가 나는 다른 받침 철자도 보기로 쓴다
import type { Unit } from '../data/curriculum'
import { realWordChoices } from '../data/listeningChoices'
import { COMPOUND, JONG, REP, isSyllable, jongOf, withJong } from './hangul'

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
import { shuffle } from './util'

// sound: 소리 나는 대로 쓴 글자 (젊고 → 점고). 겹받침 문제에서 가장 헷갈리는 오답으로 꼭 넣는다
export type CandKind = 'correct' | 'swap' | 'spell' | 'opposite' | 'hsound' | 'exception' | 'sound'

export interface Cand {
  label: string
  jong: string // 바뀐 음절의 받침
  kind: CandKind
}

const GENERIC = ['ㄴ', 'ㄹ', 'ㅁ', 'ㅇ', 'ㄱ', 'ㅂ']
const SINGLE = JONG.filter((j) => j && !COMPOUND[j])
/** 소리가 비슷해서 헷갈리기 쉬운 받침 (정답의 받침 소리 → 우선 쓸 오답 받침) */
const CONFUSABLE: Record<string, string[]> = {
  ㄱ: ['ㅇ', 'ㅂ'],
  ㄴ: ['ㅇ', 'ㅁ'],
  ㄷ: ['ㄴ', 'ㄹ'],
  ㄹ: ['ㄴ', 'ㅁ'],
  ㅁ: ['ㄴ', 'ㅇ'],
  ㅂ: ['ㅁ', 'ㅇ'],
  ㅇ: ['ㄴ', 'ㅁ'],
}

/** 받침으로 자주 보는 글자 순서 (같은 소리 철자 보기를 고를 때 우선) */
const COMMON = ['ㄱ', 'ㅅ', 'ㄷ', 'ㅋ', 'ㅂ', 'ㅍ', 'ㅆ', 'ㄲ', 'ㅌ', 'ㅈ', 'ㅊ', 'ㅎ']

/** 핵심 음절(받침을 학습하는 음절)의 위치 */
export function keyIdxOf(text: string, unit: Unit): number {
  const chars = Array.from(text)
  if (unit.part === 2) {
    const i = chars.findIndex((c) => COMPOUND[jongOf(c)])
    return i >= 0 ? i : 0
  }
  const i = chars.findIndex((c) => REP[jongOf(c)] === unit.sound)
  if (i >= 0) return i
  return Math.max(0, chars.findIndex((c) => jongOf(c)))
}

/** 겹받침 규칙에서 '헷갈리기 쉬운' 받침 */
function ruleCand(orig: string, unit: Unit, special: boolean): { jong: string; kind: CandKind } | null {
  const pair = COMPOUND[orig]
  if (!pair) return null
  const [a, b] = pair
  if (special) return { jong: a, kind: 'exception' } // 밟다는 뒤(ㅂ)로 읽는 예외 → 앞(ㄹ)로 읽기 쉽다
  if (b === 'ㅎ') return { jong: a, kind: 'hsound' } // ㅎ 소리를 놓침
  return unit.rule === 'back' ? { jong: a, kind: 'opposite' } : { jong: b, kind: 'opposite' }
}

const replaceAt = (chars: string[], idx: number, jong: string) => {
  const c = [...chars]
  c[idx] = withJong(c[idx], jong)
  return c.join('')
}

/**
 * 정답 + 오답 2개(총 3개)를 만든다.
 * @param pron 정답의 실제 발음 (핵심 음절의 소리를 알기 위해)
 */
export function makeOptions(
  target: string,
  pron: string,
  unit: Unit,
  special: boolean,
  mode: 'picture' | 'hear',
): { idx: number; origJong: string; options: Cand[] } {
  const chars = Array.from(target)
  const idx = keyIdxOf(target, unit)
  const orig = jongOf(chars[idx])
  if (unit.part === 1) {
    const options: Cand[] = [{ label: target, jong: orig, kind: 'correct' },
      ...realWordChoices(target).map(label => ({ label, jong: jongOf(Array.from(label)[idx] ?? ''), kind: 'swap' as const }))]
    return { idx, origJong: orig, options: shuffle(options) }
  }
  const pronRep = REP[jongOf(Array.from(pron)[idx] ?? '')] ?? REP[orig] ?? ''
  let rule = unit.part === 2 ? ruleCand(orig, unit, special) : null

  // 소리 듣고 고르기에서는 정답과 똑같이 들리는 보기를 쓰면 안 된다.
  // 뒤에 ㄴ·ㅁ 이 오면 받침이 콧소리로 바뀌어(앉는다→[안는다], 앚는다도 [안는다]) 구별할 수 없고,
  // ㅎ 겹받침은 뒤에 ㄱ·ㄷ·ㅈ 이 올 때만 ㅋ·ㅌ·ㅊ 소리가 달라진다.
  if (rule && mode === 'hear') {
    const nx = chars[idx + 1]
    const ini = nx && isSyllable(nx) ? INITIALS[Math.floor((nx.charCodeAt(0) - 0xac00) / 588)] : ''
    if (ini === 'ㄴ' || ini === 'ㅁ') rule = null
    else if (rule.kind === 'hsound' && !['ㄱ', 'ㄷ', 'ㅈ'].includes(ini)) rule = null
  }

  const taken = new Set<string>([target])
  const mk = (jong: string, kind: CandKind): Cand | null => {
    const label = replaceAt(chars, idx, jong)
    if (taken.has(label)) return null
    taken.add(label)
    return { label, jong, kind }
  }

  const distractors: Cand[] = []
  const push = (c: Cand | null) => c && distractors.push(c)

  // 같은 소리가 나는 다른 받침 철자 (그림 문제에서만). 아이들이 흔히 보는 받침을 먼저 쓴다
  const rank = (j: string) => {
    const k = COMMON.indexOf(j)
    return k < 0 ? 99 : k
  }
  const spellAll = SINGLE.filter((j) => REP[j] === pronRep && j !== orig && j !== rule?.jong).sort((x, y) => rank(x) - rank(y))
  const spellPool = [...shuffle(spellAll.slice(0, 2)), ...spellAll.slice(2)]
  // 소리가 다른 받침 (모든 문제). 소리가 비슷해 헷갈리기 쉬운 받침을 먼저 쓴다
  const confuse = CONFUSABLE[pronRep] ?? []
  const confRank = (j: string) => {
    const k = confuse.indexOf(j)
    return k < 0 ? 99 : k
  }
  const swapAll = shuffle(GENERIC.filter((j) => REP[j] !== pronRep && j !== orig && j !== rule?.jong))
  const swapPool = [...swapAll].sort((x, y) => confRank(x) - confRank(y))

  if (unit.part === 2) {
    // 겹받침: 소리 나는 대로 쓴 글자(점고)를 먼저 넣고, 규칙을 헷갈리기 쉬운 받침(절고)을 하나 더 넣는다.
    // 소리만 듣고는 고를 수 없어서, 낱말의 겹받침 글자를 알아야 맞힐 수 있다.
    const soundJong = jongOf(Array.from(pron)[idx] ?? '')
    if (soundJong && soundJong !== orig) push(mk(soundJong, 'sound'))
    if (rule) push(mk(rule.jong, rule.kind))
  } else if (mode === 'picture') {
    if (spellPool.length) push(mk(spellPool[0], 'spell'))
    if (rule) push(mk(rule.jong, rule.kind))
  } else if (rule) {
    push(mk(rule.jong, rule.kind))
  }
  for (const j of swapPool) {
    if (distractors.length >= 2) break
    push(mk(j, 'swap'))
  }
  // 모자라면 같은 소리 철자·일반 받침으로 채운다
  for (const j of [...spellPool, ...GENERIC]) {
    if (distractors.length >= 2) break
    if (j !== orig) push(mk(j, 'swap'))
  }

  const options: Cand[] = [{ label: target, jong: orig, kind: 'correct' }, ...distractors.slice(0, 2)]
  return { idx, origJong: orig, options: shuffle(options) }
}
