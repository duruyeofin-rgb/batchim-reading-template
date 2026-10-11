// 문단 읽기 판정: 문장부호·띄어쓰기를 지운 뒤 글자 유사도(레벤슈타인 거리 기반) 계산
import { COMPOUND, REP, iRago, isSyllable, jongOf, withJong } from './hangul'

/** 낱말 하나를 따로 읽는 연습의 합격선 (낱말은 짧아서 한 글자만 틀려도 불합격에 가깝게) */
export const PASS_SIMILARITY = 0.8

/** 띄어쓰기·문장부호를 지운다 (글자는 그대로) */
export const strip = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '')

// 음성 인식은 소리가 같은 표기를 다르게 적는다.
//  - 사이시옷: 가운뎃손가락 ↔ 가운데손가락 (인식기는 보통 '가운데 손가락'으로 적는다)
//  - 숫자: 다섯 ↔ 5, 열 ↔ 10
// 비교할 때만 이런 차이를 같은 것으로 본다.
const SAI_NEXT = new Set([0, 3, 7, 9, 12]) // 뒤 음절의 첫소리가 ㄱ ㄷ ㅂ ㅅ ㅈ 일 때

/** 받침 ㅅ(사이시옷) 뒤에 ㄱ·ㄷ·ㅂ·ㅅ·ㅈ 으로 시작하는 음절이 오면 ㅅ을 뺀다. 글자 수는 그대로다 */
function foldSai(s: string): string {
  const chars = Array.from(s)
  for (let i = 0; i < chars.length - 1; i++) {
    const c = chars[i]
    const nx = chars[i + 1]
    if (isSyllable(c) && isSyllable(nx) && jongOf(c) === 'ㅅ' && SAI_NEXT.has(Math.floor((nx.charCodeAt(0) - 0xac00) / 588))) {
      chars[i] = withJong(c, '')
    }
  }
  return chars.join('')
}

/** 비교용 글자: 띄어쓰기·문장부호 제거 + 사이시옷 차이 무시 */
export const normalize = (s: string) => foldSai(strip(s))

const NATIVE_NUM: Record<number, string[]> = {
  1: ['하나', '한', '일'],
  2: ['둘', '두', '이'],
  3: ['셋', '세', '삼'],
  4: ['넷', '네', '사'],
  5: ['다섯', '오'],
  6: ['여섯', '육'],
  7: ['일곱', '칠'],
  8: ['여덟', '팔'],
  9: ['아홉', '구'],
  10: ['열', '십'],
}

/** 인식 결과의 숫자(5, 10)를 원래 문장에 있는 우리말 수(다섯, 열)로 바꾼다 */
export function fixNumbers(original: string, heard: string): string {
  return heard.replace(/\d+/g, (m) => {
    const cands = NATIVE_NUM[Number(m)]
    if (!cands) return m
    return cands.find((c) => original.includes(c)) ?? m
  })
}

export interface AlignResult {
  similarity: number // 0~1
  /** 원래 문장(공백 제거) 글자별 일치 여부 */
  origMatched: boolean[]
  /** 인식 결과(공백 제거) 글자별 일치 여부 */
  heardMatched: boolean[]
  /** 원래 글자 → 짝지어진 인식 글자 위치 (없으면 -1). 일치가 아니어도(바꿔 읽음) 짝은 지어진다 */
  origToHeard: number[]
}

/** 편집 거리 + 되짚기로 어느 글자가 일치했는지 구한다 */
export function align(original: string, heard: string): AlignResult {
  const a = Array.from(normalize(original))
  const b = Array.from(normalize(heard))
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  const origMatched = new Array<boolean>(m).fill(false)
  const heardMatched = new Array<boolean>(n).fill(false)
  const origToHeard = new Array<number>(m).fill(-1)
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      origMatched[i - 1] = true
      heardMatched[j - 1] = true
      origToHeard[i - 1] = j - 1
      i--
      j--
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      origToHeard[i - 1] = j - 1
      i--
      j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      i--
    } else {
      j--
    }
  }
  const maxLen = Math.max(m, n)
  const similarity = maxLen === 0 ? 0 : Math.max(0, 1 - dp[m][n] / maxLen)
  return { similarity, origMatched, heardMatched, origToHeard }
}

export const similarity = (original: string, heard: string) => align(original, heard).similarity

export interface Judgement {
  similarity: number
  /** 틀리게 읽은 어절 수 */
  badWords: number
  pass: boolean
}

/**
 * 문장 읽기 판정.
 * 글자 유사도(%)만 보면 한 낱말을 틀려도 90% 넘게 나와서 통과되므로,
 * '틀린 어절이 하나도 없을 때'만 통과로 본다. (띄어쓰기·문장부호는 무시, 더 붙은 말은 허용)
 */
export function judgeReading(original: string, heard: string): Judgement {
  const sim = similarity(original, heard)
  const badWords = markWords(original, heard).filter((m) => m.bad).length
  return { similarity: sim, badWords, pass: badWords === 0 && normalize(heard).length > 0 }
}

/** 낱말 하나 따로 읽기 판정: 글자가 모두 맞아야 통과 */
export const judgeWord = (word: string, heard: string) => normalize(word) === normalize(heard) || similarity(word, heard) >= 1

export interface WordMark {
  word: string
  bad: boolean
}

/** 원래 문장을 어절로 나누고, 인식 결과와 다른 어절에 bad 표시 */
export function markWords(original: string, heard: string): WordMark[] {
  const { origMatched } = align(original, heard)
  let pos = 0
  return original
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const len = Array.from(normalize(word)).length
      let bad = false
      for (let k = 0; k < len; k++) if (!origMatched[pos + k]) bad = true
      pos += len
      return { word, bad }
    })
}

export interface CharMark {
  ch: string
  bad: boolean
}

/** 인식된 글자에서 원래 문장과 다른 글자에 bad 표시 (교사 화면용) */
export function markHeard(original: string, heard: string): CharMark[] {
  const { heardMatched } = align(original, heard)
  let k = 0
  return Array.from(heard).map((ch) => {
    if (normalize(ch) === '') return { ch, bad: false }
    const bad = !heardMatched[k]
    k++
    return { ch, bad }
  })
}

// ───────── 틀린 낱말 짚어 주기 ─────────

/** 받침 글자가 실제로 나는 소리(대표음). 겹받침은 읽는 규칙을 따른다 */
export function jongSound(jong: string, syllable = ''): string {
  if (!jong) return ''
  const pair = COMPOUND[jong]
  if (!pair) return REP[jong] ?? jong
  if (jong === 'ㄼ' && syllable === '밟') return 'ㅂ' // 밟다는 예외
  const back = jong === 'ㄺ' || jong === 'ㄻ' || jong === 'ㄿ'
  return REP[back ? pair[1] : pair[0]] ?? pair[0]
}

export interface WordFeedback {
  word: string
  said: string // 인식된 글자 ('' 이면 잘 안 들림)
  hint: string // **굵게** 표시를 포함한 안내 문장
}

const head = (c: string) => Math.floor((c.charCodeAt(0) - 0xac00) / 28)

/** 낱말에서 받침이 있는 음절 중 인식 결과와 받침이 다른 첫 음절을 찾는다 */
function batchimHint(word: string, said: string): string | null {
  const w = Array.from(normalize(word))
  const s = Array.from(said)
  if (w.length !== s.length) return null
  for (let i = 0; i < w.length; i++) {
    if (w[i] === s[i] || !isSyllable(w[i]) || !isSyllable(s[i])) continue
    const wj = jongOf(w[i])
    const sj = jongOf(s[i])
    // 다음 글자가 'ㅇ'으로 시작하면 받침이 뒤로 이어져 읽히므로(연음) 받침 소리 힌트를 주지 않는다
    const next = w[i + 1]
    const liaison = next && isSyllable(next) && Math.floor((next.charCodeAt(0) - 0xac00) / 588) === 11
    // 받침만 다르게 읽은 경우 (받침을 뺀 앞부분 글자는 같음)
    if (!liaison && wj && wj !== sj && head(w[i]) === head(s[i])) {
      return `'${w[i]}'의 받침은 **${wj}**이에요. **[${jongSound(wj, w[i])}]** 소리가 나요.`
    }
  }
  return null
}

/** 틀린 어절마다 "이렇게 들렸어요 + 받침 힌트"를 만든다 */
export function wordFeedbacks(original: string, heard: string): WordFeedback[] {
  const { origToHeard } = align(original, heard)
  const hs = Array.from(strip(heard)) // 학생에게 보여 줄 글자는 인식된 그대로
  const marks = markWords(original, heard)
  let pos = 0
  const out: WordFeedback[] = []
  for (const m of marks) {
    const len = Array.from(normalize(m.word)).length
    if (m.bad) {
      const idxs = origToHeard.slice(pos, pos + len).filter((x) => x >= 0)
      const said = idxs.length ? hs.slice(Math.min(...idxs), Math.max(...idxs) + 1).join('') : ''
      const batchim = said ? batchimHint(m.word, said) : null
      const clean = m.word.replace(/[^\p{L}\p{N}]/gu, '')
      let hint: string
      if (!said) hint = `'${clean}' 부분이 잘 안 들렸어요. 천천히 또박또박 읽어요.`
      else if (batchim) hint = `'${said}'${iRago(said)} 들렸어요. ${batchim}`
      else hint = `'${said}'${iRago(said)} 들렸어요. 글자를 하나씩 보며 다시 읽어요.`
      out.push({ word: clean, said, hint })
    }
    pos += len
  }
  return out
}
