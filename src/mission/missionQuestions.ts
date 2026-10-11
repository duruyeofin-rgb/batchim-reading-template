import { fillQuestion } from '../learning/content'
import { meaningOf } from '../data/meanings'
import { UNITS, type Unit, activeSentences, activeWords, wordItemId } from '../data/curriculum'
import { sentenceQuestion, wordQuestion, type Question } from '../lib/quiz'
import { checkpointUnits, isCheckpoint } from './checkpoints'
import type { MissionChoice } from './missionTypes'

export function questionById(id: string): Question | undefined {
  for (const u of UNITS) {
    const w = activeWords(u).find(({ i }) => wordItemId(u, i) === id)
    if (w) return wordQuestion(u, w.i, w.w)
    const f = activeWords(u).find(({ i }) => `${u.id}-f${i}` === id)
    if (f) return fillQuestion(u, f.i, f.w.text, f.w.pron, meaningOf(f.w.text))
    const s = activeSentences(u).find(({ i }) => `${u.id}-s${i}` === id)
    if (s) return sentenceQuestion(u, s.i, s.s)
  }
}
export function missionQuestions(unit: Unit, choice: MissionChoice): Question[] {
  if (isCheckpoint(unit.id)) {
    return checkpointUnits(unit).flatMap((u) => {
      const words = activeWords(u),
        sentences = activeSentences(u)
      const focused = choice.focusIds.map(questionById).find((q) => q?.unitId === u.id && q.level === 'word')
      const wi = Math.floor(Math.random() * words.length),
        w = words[wi],
        f = words[(wi + 1) % words.length]
      const s = sentences[Math.floor(Math.random() * sentences.length)]
      return [
        focused ?? wordQuestion(u, w.i, w.w),
        fillQuestion(u, f.i, f.w.text, f.w.pron, meaningOf(f.w.text)),
        sentenceQuestion(u, s.i, s.s),
      ]
    })
  }
  const words = activeWords(unit).map(({ w, i }) => wordQuestion(unit, i, w))
  const selected: Question[] = []
  const add = (q?: Question) => {
    if (q && selected.length < 3 && !selected.some((x) => x.id === q.id)) selected.push(q)
  }
  // Selector already restricts focus IDs to current or completed related units.
  add(questionById(choice.focusIds[0] ?? '') ?? words[0])
  if (choice.kind === 'train') {
    for (const { s, i } of activeSentences(unit)) add(sentenceQuestion(unit, i, s))
  } else {
    add(words.find((q) => !selected.some((x) => x.id === q.id) && !choice.successIds.includes(q.id)))
    add(words.find((q) => choice.successIds.includes(q.id) && !selected.some((x) => x.id === q.id)))
  }
  for (const q of words) add(q)
  if (selected.length !== 3) throw new Error('미션에 필요한 세 문항이 없습니다.')
  for (const q of selected) {
    if (
      q.options.length !== 3 ||
      q.options.filter((o) => o.correct).length !== 1 ||
      new Set(q.options.map((o) => o.label)).size !== 3
    )
      throw new Error('미션 보기 검증 실패')
  }
  return selected
}
