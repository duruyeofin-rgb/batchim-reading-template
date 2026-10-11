import { useEffect, useRef, useState } from 'react'
import { activeWords, type Unit } from '../data/curriculum'
import { meaningOf } from '../data/meanings'
import { jongOf } from '../lib/hangul'
import { wordQuestion, type Question } from '../lib/quiz'
import { speak, stopSpeaking } from '../lib/tts'
import { useStu } from '../student/ctx'
import { StoryReader } from '../student/Story'
import MissionQuestion from '../mission/MissionQuestion'
import { answerResult, emptyResult, type MissionResult } from '../mission/missionTypes'
import { TRANSFER, fillQuestion, koreaDay } from './content'
import { clearLocal, draftKey, learningContext, loadLocal, saveLocal, saveLearningAndContinue, cachedLearningContext, hasPendingLearning, type LearningContext, type Submission } from './api'
import '../mission/missions.css'

type Draft = {
  submission: Submission
  questions: Question[]
  answers: MissionResult[]
  readings: string[]
  at?: number
  readingDone: boolean
  readRows?: { passed: boolean; firstTry: boolean }[]
}
export default function Practice({
  unit,
  review = false,
  onDone,
  onExit,
}: {
  unit: Unit
  review?: boolean
  onDone: () => void
  onExit: () => void
}) {
  const { student } = useStu(),
    key = draftKey(student.id, unit.id, review ? 'review' : 'practice')
  const [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    let alive = true
    const prepare = (ctx: LearningContext) => {
      if (!alive) return
      const schedule = ctx.schedules.find((s) => s.unit_id === unit.id),
        round = review ? (schedule?.round ?? 0) : 0
      if (hasPendingLearning(student.id, unit.id, review ? 'review' : 'practice', ctx.epoch, round)) {
        onDone()
        return
      }
      const old = loadLocal<Draft>(key)
      if (old?.submission.epoch === ctx.epoch && old.submission.round === round) {
        setDraft(old)
        return
      }
      clearLocal(key)
      if (review && (!schedule?.due_on || schedule.due_on > koreaDay())) {
        onDone()
        return
      }
      const words = activeWords(unit),
        fresh = TRANSFER[unit.id],
        offset = review ? round + 2 : 0
      const weak = schedule?.weak ?? []
      const targets = words.filter(({ w, i }) =>
        weak.some(
          (k) =>
            k === `${unit.id}-w${i}` ||
            k === `${unit.id}-f${i}` ||
            [...w.text].some((c) => jongOf(c) && k.split(' ').includes(jongOf(c))),
        ),
      )
      const rotate = <T,>(pool: T[], n: number) => pool.map((_, i) => pool[(i + n) % pool.length])
      const prioritized = review && targets.length ? rotate(targets, round) : []
      const ordered = [...prioritized, ...rotate(words, offset * 3).filter((w) => !prioritized.includes(w))]
      const selected = ordered.slice(0, 4)

      const questions = selected.map(({ w, i }, at) =>
        review && at < 2 ? wordQuestion(unit, i, w) : fillQuestion(unit, i, w.text, w.pron, meaningOf(w.text)),
      )
      const first = fresh[offset % fresh.length],
        second = fresh[(offset + 1) % fresh.length]
      const readings = review
        ? [first.word, second.sentence]
        : [first.word, second.word, first.sentence, second.sentence]
      const d: Draft = {
        submission: {
          id: crypto.randomUUID(),
          student: student.id,
          epoch: ctx.epoch,
          unit: unit.id,
          kind: review ? 'review' : 'practice',
          round,
          results: [],
          reflection: '',
        },
        questions,
        answers: questions.map((q) => emptyResult(q.id)),
        readings,
        at: 0,
        readingDone: false,
      }
      saveLocal(key, d)
      setDraft(d)
    }
    learningContext(student.id).then(prepare).catch(() => {
      if (!alive) return
      const old = loadLocal<Draft>(key), cached = cachedLearningContext(student.id)
      if (hasPendingLearning(student.id, unit.id, review ? 'review' : 'practice')) onDone()
      else if (old) setDraft(old)
      else if (cached) prepare(cached)
      else onDone() // Optional activity is unavailable; never trap the learner on a retry screen.
    })
    return () => {
      alive = false
      stopSpeaking()
    }
  }, [student.id, unit.id, review])
  const update = (d: Draft) => {
    setDraft(d)
    if (!saveLocal(key, d)) setError('기기에 저장할 공간이 부족해요. 화면을 닫기 전에 선생님께 알려 주세요.')
  }
  const index = draft ? (draft.at ?? draft.answers.findIndex((a) => !a.resolved)) : -1
  const q = index >= 0 ? draft?.questions[index] : null
  useEffect(() => {
    if (q) speak(q.audio)
  }, [q?.id])
  const finish = async () => {
    if (!draft || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await saveLearningAndContinue(draft.submission)
      clearLocal(key)
      onDone()
    } catch {
      setError('기기와 서버에 저장하지 못했어요. 이 화면을 닫지 말고 선생님께 알려 주세요.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  if (!draft) return <p className="m-auto text-2xl" role="status">새로운 문제를 준비해요…</p>
  if (draft.readingDone)
    return (
      <div className="card m-auto max-w-2xl space-y-5 text-center text-2xl">
        <h2 className="text-4xl">오늘 배운 것을 기억해요</h2>
        <p>
          {draft.submission.results.filter((r) => r.first && !r.helped).length} / {draft.submission.results.length}개를
          스스로 해결했어요.
        </p>
        <p role="status">{error || '결과를 저장하고 다음으로 가요. 연결이 늦으면 이 기기에 보관해요.'}</p>
        <button className="btn-primary" disabled={busy} onClick={() => void finish()}>
          {busy ? '저장 중…' : '결과 저장하기'}
        </button>
        <button className="btn-soft" onClick={onExit}>
          나중에 저장하기
        </button>
      </div>
    )
  if (!q)
    return (
      <StoryReader
        key={`${unit.id}-${draft.submission.round}`}
        story={{
          id: `practice-${unit.id}-${draft.submission.round}`,
          title: '새 낱말과 문장 읽기',
          sentences: draft.readings,
        }}
        label={review ? '다른 문장으로 다시 읽어요' : '3단계 · 새 낱말과 문장을 읽어요'}
        onExit={onExit}
        onNext={null}
        practiceMode
        initialReadRows={draft.readRows}
        onReadingProgress={(rows) => update({ ...draft, readRows: rows })}
        onReadingComplete={(rows) =>
          update({
            ...draft,
            readingDone: true,
            submission: {
              ...draft.submission,
              results: [
                ...draft.answers.map((a, i) => ({
                  id: draft.questions[i].id,
                  skill: jongOf([...draft.questions[i].target][draft.questions[i].keyIdx]),
                  first: a.first_correct === true,
                  passed: a.resolved,
                  helped: a.hint_used,
                })),
                ...rows.map((r, i) => ({
                  id: `${unit.id}-read-${draft.submission.round}-${i}`,
                  skill: unit.jamos,
                  first: r.firstTry,
                  passed: r.passed,
                  helped: !r.firstTry,
                })),
              ],
            },
          })
        }
      />
    )
  const result = draft.answers[index]
  return (
    <div className="mission-wrap max-w-4xl">
      <header className="mission-header">
        <h2>{review ? '다시 만나는 복습' : '2단계 · 빠진 받침 채우기'}</h2>
        <span>
          {index + 1} / {draft.questions.length}
        </span>
      </header>
      <MissionQuestion
        q={q}
        kind="rescue"
        result={result}
        blocked={result.resolved}
        onPick={(o) => {
          if (result.resolved) return
          const answers = [...draft.answers]
          answers[index] = answerResult(result, o.correct)
          update({ ...draft, answers })
          speak(o.correct ? `${q.target}. 잘 생각했어요.` : o.feedback)
        }}
        onHint={() => {
          const answers = [...draft.answers]
          answers[index] = { ...result, hint_used: true }
          update({ ...draft, answers })
        }}
      />
      {result.resolved && (
        <div className="card mt-4 flex flex-wrap items-center gap-4 bg-green-50 text-2xl">
          <p>맞아요! {q.target}의 받침을 채웠어요.</p>
          <button className="btn-green" onClick={() => update({ ...draft, at: index + 1 })}>
            {index + 1 === draft.questions.length ? '새 낱말 읽기 ▶' : '다음 문제 ▶'}
          </button>
        </div>
      )}
      <p className="mt-4 text-xl" role="status">
        {error ||
          (!result.resolved && result.tries > 0
            ? '받침 힌트를 보고 한 번 더 생각해요.'
            : '소리와 뜻을 생각하며 골라요.')}
      </p>
      <button className="btn-soft mt-4" onClick={onExit}>
        잠깐 쉬기 · 지도로
      </button>
    </div>
  )
}
