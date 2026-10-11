import test from 'node:test'
import assert from 'node:assert/strict'
import { UNITS, activeWords, wordItemId } from '../src/data/curriculum'
import { selectMission } from '../src/mission/missionSelector'
import { checkpointUnits, isCheckpoint } from '../src/mission/checkpoints'
import { missionQuestions, questionById } from '../src/mission/missionQuestions'
import { answerResult, emptyResult, type MissionDraft } from '../src/mission/missionTypes'
import { reconcileDraft, readDraft, writeDraft, clearDraft } from '../src/mission/missionStore'
import { type GAttempt } from '../src/lib/growth'
import { sceneOf, worldState, STEPS } from '../src/data/dreamWorld'
import { readFileSync, existsSync } from 'node:fs'

const unit = UNITS[0],
  first = activeWords(unit)[0],
  id = wordItemId(unit, first.i)
const attempt = (n: number, correct = false, item = id, target = first.w.text, unitId = unit.id): GAttempt => ({
  id: n,
  student_id: 's',
  level: 'word',
  unit_id: unitId,
  item_id: item,
  target,
  answer: null,
  is_correct: correct,
  first_try: true,
  feedback: null,
  created_at: new Date(Date.UTC(2026, 9, 1, n)).toISOString(),
})
test('no history: common review covers each completed checkpoint unit', () => {
  for (const u of UNITS) {
    const c = selectMission(u, [], []),
      qs = missionQuestions(u, c)
    assert.match(c.reason, /공통 복습/)
    assert.equal(qs.length, isCheckpoint(u.id) ? 12 : 3)
    assert.equal(new Set(qs.map((q) => q.id)).size, qs.length)
    assert(qs.every((q) => checkpointUnits(u).some(x => x.id === q.unitId) && q.options.filter((o) => o.correct).length === 1))
  }
})
test('one error is not classified as repetition; current lesson error is a neutral review', () => {
  assert.equal(selectMission(unit, [attempt(1)], []).focusIds.length, 0)
  const c = selectMission(unit, [attempt(1)], [], [id])
  assert.equal(c.focusIds[0], id)
  assert.match(c.reason, /반복 오류로 판단하지 않습니다/)
})
test('different sessions repeat, same-session retries do not; later success clears focus', () => {
  assert.equal(selectMission(unit, [attempt(1), attempt(2)], []).focusIds[0], id)
  const a = attempt(2)
  a.created_at = attempt(1).created_at
  assert.equal(selectMission(unit, [attempt(1), a], []).focusIds.length, 0)
  assert.equal(selectMission(unit, [attempt(1), attempt(2), attempt(3, true)], []).focusIds.length, 0)
})
test('future or unrelated mistakes and speech recognition do not change mission focus', () => {
  const future = UNITS.at(-1)!,
    w = activeWords(future)[0]
  const rows = [
    attempt(1, false, wordItemId(future, w.i), w.w.text, future.id),
    attempt(2, false, wordItemId(future, w.i), w.w.text, future.id),
  ]
  assert.equal(selectMission(unit, rows, []).focusIds.length, 0)
  assert.equal(selectMission(unit, [...rows, ...rows.map((a) => ({ ...a, level: 'paragraph' }))], []).kind, 'rescue')
})
test('sufficient word/sentence gap selects hospital train, not a one-error inference', () => {
  const rows: GAttempt[] = []
  for (let n = 1; n <= 8; n++) {
    rows.push(attempt(n, true, `word-${n}`))
    rows.push({ ...attempt(n + 10, false, `sentence-${n}`), level: 'sentence' })
  }
  const c = selectMission(unit, rows, [])
  assert.equal(c.kind, 'train')
  assert(missionQuestions(unit, c).some((q) => q.level === 'sentence'))
})
test('compound spelling/pronunciation and 밟다 exception retain authoritative curriculum data', () => {
  for (const u of UNITS.filter((u) => u.part === 2)) {
    assert.equal(selectMission(u, [], []).kind, 'treasure')
    for (const { w, i } of activeWords(u)) {
      const q = questionById(wordItemId(u, i))!
      assert.equal(q.target, w.text)
      assert.equal(q.pron, w.pron)
      assert.equal(q.options.filter((o) => o.correct).length, 1)
      if (w.special) {
        assert(q.special)
        assert(q.options.some((o) => o.feedback.includes('뒤의 ㅂ')))
      }
    }
  }
})
test('known successful word is the last success experience when available', () => {
  const last = activeWords(unit).at(-1)!,
    lastId = wordItemId(unit, last.i)
  const c = selectMission(unit, [attempt(1, true, lastId, last.w.text)], [], [id])
  assert.equal(missionQuestions(unit, c)[2].id, lastId)
})
function makeDraft(): MissionDraft {
  const c = selectMission(unit, [], []),
    questions = missionQuestions(UNITS[3], c),
    now = new Date().toISOString()
  return {
    questions,
    dirty: true,
    run: {
      student_id: 's',
      class_id: 'c',
      unit_id: unit.id,
      epoch: 'epoch1',
      kind: c.kind,
      reason: c.reason,
      status: 'started',
      item_ids: questions.map((q) => q.id),
      results: questions.map((q) => emptyResult(q.id)),
      revision: 1,
      started_at: now,
      updated_at: now,
    },
  }
}
test('first try, hint and final resolution are independent; solved questions ignore double click', () => {
  let r = answerResult(emptyResult(id), false)
  r = answerResult(r, false)
  r = answerResult(r, false)
  assert.equal(r.tries, 3)
  assert.equal(r.first_correct, false)
  assert.equal(r.hint_used, true)
  r = answerResult(r, true)
  assert.equal(r.resolved, true)
  assert.equal(r.first_correct, false)
  assert.deepEqual(answerResult(r, true), r)
  const hintFirst = answerResult({ ...emptyResult(id), hint_used: true }, true)
  assert(hintFirst.first_correct && hintFirst.hint_used)
})
test('refresh persistence is scoped by student; offline changes are retained, reset epoch discards them', () => {
  const m = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => m.set(k, v),
      removeItem: (k: string) => m.delete(k),
    },
  })
  const d = makeDraft()
  d.run.results[0] = answerResult(d.run.results[0], false)
  assert(writeDraft(d))
  assert.deepEqual(readDraft('s', unit.id), JSON.parse(JSON.stringify(d)))
  assert.equal(readDraft('different', unit.id), null)
  assert.deepEqual(reconcileDraft(d, 'epoch1', null), d)
  assert.equal(reconcileDraft(d, 'new-epoch', null), null)
  const completed = { ...d.run, status: 'completed' as const, revision: 2 }
  assert.equal(reconcileDraft(d, 'epoch1', completed)?.run.status, 'completed')
  clearDraft('s', unit.id)
  assert.equal(readDraft('s', unit.id), null)
})
test('mission code cannot award stars or alter normal progress; locked clothing stays locked', () => {
  assert.deepEqual(sceneOf('doctor', []), { outfit: undefined, bg: undefined, tools: [] })
  const student = { job: 'doctor', dream_total: 4, items: [] as string[] }
  const before = worldState(student, new Map())
  const d = makeDraft()
  d.run.results = d.run.results.map((r) => answerResult(r, true))
  d.run.status = 'completed'
  assert.deepEqual(worldState(student, new Map()), before)
  assert.equal(before.canOpen, false)
  assert.deepEqual(
    STEPS.map((x) => x[1]),
    [5, 15, 30, 50, 80, 120],
  )
  for (const file of ['MissionRunner.tsx', 'MissionGate.tsx', 'missionApi.ts']) {
    const s = readFileSync(`src/mission/${file}`, 'utf8')
    assert(!/earnDream|saveAttempt\(|saveProgress\(|patchStudent\(/.test(s))
  }
})
test('all optimized scene objects exist', () => {
  for (const name of ['monster', 'chest', 'chest-open', 'train', 'hospital', 'lock'])
    assert(existsSync(`public/missions/${name}.webp`))
})

test('storage quota failure retains newest memory state and reset clears an undeletable stale copy', () => {
  const d = makeDraft(),
    old = JSON.stringify(d)
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => old,
      setItem: () => {
        throw Error('quota')
      },
      removeItem: () => {
        throw Error('denied')
      },
    },
  })
  d.run.revision = 5
  d.run.results[0] = answerResult(d.run.results[0], false)
  assert.equal(writeDraft(d), false)
  assert.equal(readDraft('s', unit.id)?.run.revision, 5)
  clearDraft('s', unit.id)
  assert.equal(readDraft('s', unit.id), null)
})
test('another device’s immutable server plan wins over a higher offline revision', () => {
  const local = makeDraft()
  local.run.revision = 20
  const remote = { ...local.run, revision: 1, started_at: '2020-01-01T00:00:00.000Z' }
  assert.equal(reconcileDraft(local, local.run.epoch, remote)?.run.revision, 1)
})
