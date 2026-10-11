// 한글 음절 분해·받침 도구
const BASE = 0xac00
const END = 0xd7a3

export const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ',
  'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

export const isSyllable = (ch: string) => {
  const c = ch.charCodeAt(0)
  return c >= BASE && c <= END
}

/** 음절의 받침 글자 ('' 이면 받침 없음) */
export const jongOf = (ch: string) => (isSyllable(ch) ? JONG[(ch.charCodeAt(0) - BASE) % 28] : '')

/** 음절의 받침만 다른 글자로 바꾼다 */
export const withJong = (ch: string, jong: string) => {
  const c = ch.charCodeAt(0)
  const idx = JONG.indexOf(jong)
  return String.fromCharCode(c - ((c - BASE) % 28) + idx)
}

/** 대표음 */
export const REP: Record<string, string> = {
  ㄱ: 'ㄱ', ㅋ: 'ㄱ', ㄲ: 'ㄱ',
  ㄴ: 'ㄴ',
  ㄷ: 'ㄷ', ㅅ: 'ㄷ', ㅆ: 'ㄷ', ㅈ: 'ㄷ', ㅊ: 'ㄷ', ㅌ: 'ㄷ', ㅎ: 'ㄷ',
  ㄹ: 'ㄹ',
  ㅁ: 'ㅁ',
  ㅂ: 'ㅂ', ㅍ: 'ㅂ',
  ㅇ: 'ㅇ',
}

/** 겹받침 → [앞, 뒤] */
export const COMPOUND: Record<string, [string, string]> = {
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'],
  ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'],
  ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'],
}

/** 받침이 있는지 (낱말 끝 글자 기준 조사 선택용) */
const hasFinal = (word: string) => {
  const last = word[word.length - 1] ?? ''
  if (isSyllable(last)) return jongOf(last) !== ''
  return false
}
const finalIsRieul = (word: string) => jongOf(word[word.length - 1] ?? '') === 'ㄹ'

/** 은/는 */
export const eunNeun = (word: string) => (hasFinal(word) ? '은' : '는')
/** (으)로 */
export const euroRo = (word: string) => (!hasFinal(word) || finalIsRieul(word) ? '로' : '으로')
/** 이/가 (예: 의사가, 선생님이) */
export const iGa = (word: string) => (hasFinal(word) ? '이' : '가')
/** 을/를 */
export const eulReul = (word: string) => (hasFinal(word) ? '을' : '를')
/** 이라고/라고 */
export const iRago = (word: string) => (hasFinal(word) ? '이라고' : '라고')
/** 이에요/예요 */
export const ieyoYeyo = (word: string) => (hasFinal(word) ? '이에요' : '예요')
/** 자모 이름 뒤 조사 (ㄱ 은, ㄹ 로 …) : 자모 이름은 모두 받침으로 끝나므로 */
export const jamoEuro = (jamo: string) => (jamo === 'ㄹ' ? '로' : '으로')

/**
 * 낱말에서 '핵심 음절' 위치를 찾는다.
 * 1) 쓴 글자와 소리의 받침이 다른 첫 음절  2) 없으면 받침이 있는 첫 음절
 */
export const keyIndex = (text: string, pron: string) => {
  const n = Math.min(text.length, pron.length)
  for (let i = 0; i < n; i++) {
    if (jongOf(text[i]) !== jongOf(pron[i])) return i
  }
  for (let i = 0; i < text.length; i++) if (jongOf(text[i])) return i
  return -1
}

/** 핵심 음절의 받침 글자 */
export const keyJong = (text: string, pron: string) => {
  const i = keyIndex(text, pron)
  return i < 0 ? '' : jongOf(text[i])
}
