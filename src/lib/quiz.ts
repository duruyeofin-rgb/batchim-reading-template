// 퀴즈 만들기
//  - picture: 그림을 보고 어울리는 낱말(받침 포함) 고르기
//  - hear   : 소리를 듣고 알맞은 낱말(받침 포함) 고르기 (문장은 빈칸에 들어갈 낱말 고르기)
// 그림이 있는 낱말은 두 방식을 섞고, 그림이 없으면 hear 로만 낸다.
import {
  type Sentence,
  type Unit,
  type Word,
  activeSentences,
  activeWords,
  sentItemId,
  wordItemId,
} from '../data/curriculum'
import { meaningOf } from '../data/meanings'
import { hasPic, picUrl } from '../data/pics'
import { COMPOUND, eunNeun, ieyoYeyo, isSyllable, jamoEuro, jongOf } from './hangul'
import { type CandKind, makeOptions } from './spelling'
import { shuffle } from './util'

export interface Option {
  label: string
  kind: CandKind
  correct: boolean
  feedback: string // **굵게** 표시는 Rich 컴포넌트가 처리
  speak: string // 🔊로 읽어 줄 글자
}

export interface Question {
  id: string
  unitId: string
  level: 'word' | 'sentence'
  format: 'picture' | 'hear'
  fill?: { before: string; base: string; after: string }
  target: string // 정답 낱말 (문장 문제면 빈칸에 들어갈 낱말)
  pron: string
  sentence?: { before: string; target: string; after: string }
  special?: boolean
  keyIdx: number // 목표 낱말에서 받침 강조할 음절 위치
  audio: string // 문제 소리 (낱말 또는 문장 전체)
  prompt: string
  pic?: string // 그림 주소 (picture 문제의 문제 그림, 문장 문제의 그림 힌트)
  options: Option[]
  /** 정답 소리 (틀렸을 때 자동 재생) */
  correctSpeak: string
  /** 정답 낱말의 뜻 한 줄 (겹받침 문제에서 보여 준다) */
  meaning?: string
}

export const QUIZ_PASS_RATE = 0.8

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const ASP: Record<string, string> = { ㄱ: 'ㅋ', ㄷ: 'ㅌ', ㅈ: 'ㅊ' }

// ───────── 오답 피드백 ─────────

/** 2부 겹받침 규칙 피드백 */
export function compoundFeedback(unit: Unit, target: string, pron: string, special?: boolean): { kind: CandKind; text: string } {
  if (special) {
    return {
      kind: 'exception',
      text: `밟다는 특별한 낱말이에요! ㄼ인데 **뒤의 ㅂ**으로 읽어서 [${pron}]${ieyoYeyo(pron)}.`,
    }
  }
  let cj = ''
  for (const ch of target) {
    if (COMPOUND[jongOf(ch)]) {
      cj = jongOf(ch)
      break
    }
  }
  const [a, b] = COMPOUND[cj] ?? ['', '']
  if (b === 'ㅎ') {
    // ㅎ 은 뒤에 오는 ㄱ·ㄷ·ㅈ 과 만나 ㅋ·ㅌ·ㅊ 소리가 난다 (많다→만타, 많고→만코, 많지→만치)
    const chars = Array.from(target)
    const at = chars.findIndex((ch) => jongOf(ch) === cj)
    const nx = chars[at + 1]
    const ini = nx && isSyllable(nx) ? INITIALS[Math.floor((nx.charCodeAt(0) - 0xac00) / 588)] : ''
    const asp = ASP[ini]
    return {
      kind: 'hsound',
      text: asp
        ? `${cj}은 앞의 ${a}${jamoEuro(a)} 읽고, ㅎ은 뒤의 ${ini}과 만나 **[${asp}]** 소리가 나요. [${pron}]${ieyoYeyo(pron)}.`
        : `${cj}은 앞의 ${a}${jamoEuro(a)} 읽어요. ${target}${eunNeun(target)} [${pron}]${ieyoYeyo(pron)}.`,
    }
  }
  const tail = `${target}${eunNeun(target)} [${pron}]${ieyoYeyo(pron)}.`
  if (unit.rule === 'back') {
    const extra = cj === 'ㄿ' ? ' (받침 ㅍ은 [ㅂ] 소리가 나요.)' : ''
    return { kind: 'opposite', text: `**${cj}**은 **뒤에 있는 ${b}**${jamoEuro(b)} 읽어요.${extra} ${tail}` }
  }
  return { kind: 'opposite', text: `**${cj}**은 **앞에 있는 ${a}**${jamoEuro(a)} 읽어요. ${tail}` }
}

interface FbCtx {
  unit: Unit
  mode: 'picture' | 'hear'
  target: string
  pron: string
  chosen: string
  origJong: string
  chosenJong: string
  kind: CandKind
  special: boolean
}

/** 오답 종류별 피드백 (어디가 틀렸는지 알려 준다) */
export function makeFeedback(c: FbCtx): string {
  if (c.unit.part === 1)
    return `${c.mode === 'picture' ? '그림의' : '들은'} 낱말은 **${c.target}**이에요. '${c.chosen}'와 소리를 비교해 보아요. '${c.target}'의 받침 **${c.origJong}**을 살펴봐요.`
  let base: string
  if (c.mode === 'picture') {
    base =
      c.kind === 'spell'
        ? `'${c.chosen}'도 소리는 비슷하지만 글자가 달라요. 그림은 '${c.target}'${ieyoYeyo(c.target)}. 받침은 **${c.origJong}**이에요.`
        : `그림은 '${c.target}'${ieyoYeyo(c.target)}. 받침은 **${c.origJong}**이에요. 고른 '${c.chosen}'${eunNeun(c.chosen)} 받침이 ${c.chosenJong}이에요.`
  } else {
    base = `들은 낱말은 '${c.target}'${ieyoYeyo(c.target)}. 받침이 **${c.origJong}**이에요. 고른 '${c.chosen}'${eunNeun(c.chosen)} 받침이 ${c.chosenJong}이에요.`
  }
  if (c.unit.part === 2 && c.kind === 'sound') {
    return `'${c.chosen}'${eunNeun(c.chosen)} 소리 나는 대로 쓴 글자예요. 하지만 글자는 '${c.target}'${ieyoYeyo(c.target)}. ${compoundFeedback(c.unit, c.target, c.pron, c.special).text}`
  }
  if (c.unit.part === 2 && (c.kind === 'opposite' || c.kind === 'hsound' || c.kind === 'exception')) {
    return `${base} ${compoundFeedback(c.unit, c.target, c.pron, c.special).text}`
  }
  return base
}

// ───────── 문항 생성 ─────────

/** 문장 속 목표 낱말의 자리를 찾아 앞/뒤로 나눈다 */
function splitSentence(text: string, target: string, at = 0) {
  let from = 0
  let pos = -1
  for (let k = 0; k <= at; k++) {
    pos = text.indexOf(target, from)
    if (pos < 0) break
    from = pos + 1
  }
  if (pos < 0) pos = 0
  return { before: text.slice(0, pos), target, after: text.slice(pos + target.length) }
}

function build(
  unit: Unit,
  id: string,
  level: 'word' | 'sentence',
  target: string,
  pron: string,
  special: boolean,
  format: 'picture' | 'hear',
  pic?: string,
  sentence?: Question['sentence'],
): Question {
  const { idx, origJong, options } = makeOptions(target, pron, unit, special, format)
  // 겹받침 낱말(넓지 등)은 기기의 음성이 글자 그대로 잘못 읽는 일이 있어서(예: 넓지 → 넙찌),
  // 정답 낱말은 소리 나는 대로 적은 글자(널찌)로 읽어 준다.
  const heard = unit.part === 2 ? pron : target
  const opts: Option[] = options.map((o) => ({
    label: o.label,
    kind: o.kind,
    correct: o.kind === 'correct',
    // 소리 나는 대로 쓴 보기는 정답과 같은 소리로 읽어 준다 (소리로는 구별되지 않고 글자를 알아야 한다)
    speak: o.kind === 'correct' || o.kind === 'sound' ? heard : o.label,
    feedback:
      o.kind === 'correct'
        ? ''
        : makeFeedback({
            unit,
            mode: format,
            target,
            pron,
            chosen: o.label,
            origJong,
            chosenJong: o.jong,
            kind: o.kind,
            special,
          }),
  }))
  return {
    id,
    unitId: unit.id,
    level,
    format,
    target,
    pron,
    sentence,
    special,
    keyIdx: idx,
    audio: sentence ? `${sentence.before}${heard}${sentence.after}` : heard,
    prompt:
      format === 'picture'
        ? '그림에 어울리는 낱말을 골라요'
        : sentence
          ? '문장을 듣고 빈칸에 알맞은 낱말을 골라요'
          : '들은 낱말을 골라요',
    pic,
    options: opts,
    correctSpeak: heard,
    meaning: unit.part === 2 ? meaningOf(target) : undefined,
  }
}

/** 그림 문제를 낼 확률 (그림이 있는 낱말만) */
const PICTURE_RATE = 0.6
/** 문장 문제에 그림 힌트를 보여 줄 확률 */
const HINT_RATE = 0.5

export function wordQuestion(unit: Unit, i: number, w: Word): Question {
  const id = wordItemId(unit, i)
  // 그림은 처음 만든 낱말 번호에 붙어 있다. 같은 낱말이 먼저 나온 번호(기본형)에 그림이 있으면 그것을 쓴다.
  const first = unit.words.findIndex((x) => x.text === w.text)
  const picId = hasPic(id) ? id : first >= 0 && hasPic(wordItemId(unit, first)) ? wordItemId(unit, first) : undefined
  const pic = picId ? picUrl(picId) : undefined
  const format = pic && Math.random() < PICTURE_RATE ? 'picture' : 'hear'
  return build(unit, id, 'word', w.text, w.pron, !!w.special, format, pic)
}

export function sentenceQuestion(unit: Unit, i: number, s: Sentence): Question {
  const id = sentItemId(unit, i)
  const sp = splitSentence(s.text, s.target, s.at)
  const wi = unit.words.findIndex((w) => s.target.startsWith(w.text) && s.pron.startsWith(w.pron))
  const special = wi >= 0 && !!unit.words[wi].special
  const hintId = wi >= 0 ? wordItemId(unit, wi) : ''
  const pic = hintId && hasPic(hintId) && Math.random() < HINT_RATE ? picUrl(hintId) : undefined
  return build(unit, id, 'sentence', s.target, s.pron, special, 'hear', pic, sp)
}

/** 한 단계의 문항을 모두 만들어 무작위로 섞는다 */
export function buildQuestions(unit: Unit, level: 'word' | 'sentence'): Question[] {
  // 도전 낱말·문장이 있는 단원은 도전 항목만 낸다 (문항 번호 i 는 원래 번호 그대로)
  const list =
    level === 'word'
      ? activeWords(unit).map(({ w, i }) => wordQuestion(unit, i, w))
      : activeSentences(unit).map(({ s, i }) => sentenceQuestion(unit, i, s))
  return shuffle(list)
}
