import { useEffect, useRef, useState } from 'react'
import { type DooruBook, readUnitId } from '../data/dooru'
import { SpeakButton } from '../components/common'
import { shuffle } from '../lib/util'
import { useStu } from '../student/ctx'
import { DooruCredit } from '../student/ReadTest'
import { STORY_ACTIVITIES } from './storyContent'
import { clearLocal, draftKey, learningContext, loadLocal, saveLocal, saveLearningAndContinue, cachedLearningContext, hasPendingLearning, type LearningContext, type Submission } from './api'

type Draft = {
  submission: Submission
  stage: number
  order: number[]
  tries: number
  selected: number | null
  checked: boolean
  helped: boolean
  choices: number[][]
}
export default function StoryActivities({ book, onExit }: { book: DooruBook; onExit: () => void }) {
  const { student } = useStu(),
    content = STORY_ACTIVITIES[book.dir],
    unit = readUnitId(book),
    key = draftKey(student.id, unit, 'story')
  const [d, setD] = useState<Draft | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [showText, setShowText] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    let alive = true
    const prepare = (ctx: LearningContext) => {
      if (!alive) return
      if (hasPendingLearning(student.id, unit, 'story', ctx.epoch)) { onExit(); return }
      const old = loadLocal<Draft>(key)
      if (old?.submission.epoch === ctx.epoch) {
        setD(old)
        return
      }
      clearLocal(key)
      setD({
        submission: {
          id: crypto.randomUUID(),
          student: student.id,
          epoch: ctx.epoch,
          unit,
          kind: 'story',
          round: 0,
          results: [],
          reflection: '',
        },
        stage: 0,
        order: [],
        tries: 0,
        selected: null,
        checked: false,
        helped: false,
        choices: content.questions.map(() => shuffle([0, 1, 2])),
      })
    }
    learningContext(student.id).then(prepare).catch(() => {
      if (!alive) return
      const old = loadLocal<Draft>(key), cached = cachedLearningContext(student.id)
      if (hasPendingLearning(student.id, unit, 'story')) onExit()
      else if (old) setD(old)
      else if (cached) prepare(cached)
      else onExit()
    })
    return () => {
      alive = false
    }
  }, [student.id, unit])
  const update = (next: Draft) => {
    setD(next)
    if (!saveLocal(key, next)) setError('기기에 저장할 공간이 부족해요. 선생님께 알려 주세요.')
  }
  if (!d) return <p className="m-auto text-2xl" role="status">이야기 활동을 준비해요…</p>
  const check = () => {
    const correct = d.stage < 2 ? d.selected === content.questions[d.stage].answer : d.order.join() === '0,1,2'
    if (correct)
      update({
        ...d,
        checked: true,
        submission: {
          ...d.submission,
          results: [
            ...d.submission.results,
            {
              id: `${unit}-${d.stage}`,
              skill: d.stage < 2 ? '내용 이해' : '내용 순서',
              first: d.tries === 0 && !d.helped,
              passed: true,
              helped: d.helped || d.tries > 0,
            },
          ],
        },
      })
    else {
      update({ ...d, tries: d.tries + 1, helped: true })
      setShowText(true)
    }
  }
  const save = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await saveLearningAndContinue(d.submission)
      clearLocal(key)
      onExit()
    } catch {
      setError('기기와 서버에 저장하지 못했어요. 이 화면을 닫지 말고 선생님께 알려 주세요.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const question = content.questions[d.stage]
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">📖 {book.title} · 이야기 생각하기</h2>
        <span className="text-xl">{d.stage + 1} / 4</span>
      </header>
      <p className="text-xl text-[#7a6248]">방금 소리 내어 읽은 부분을 생각해요.</p>
      {d.stage < 2 && (
        <section className="card space-y-4">
          <div className="flex items-center gap-3 text-3xl">
            <h3>{question.question}</h3>
            <SpeakButton text={question.question} size="sm" />
          </div>
          <div className="grid gap-3">
            {d.choices[d.stage].map((i) => (
              <button
                key={i}
                className={`btn-soft text-2xl ${d.selected === i ? 'ring-4 ring-leaf' : ''}`}
                disabled={d.checked}
                onClick={() => update({ ...d, selected: i })}
              >
                {question.choices[i]}
              </button>
            ))}
          </div>
        </section>
      )}
      {d.stage === 2 && (
        <section className="card space-y-4">
          <h3 className="text-3xl">{content.orderLabel}</h3>
          <p className="text-xl">먼저 나온 내용부터 하나씩 눌러요.</p>
          <div className="grid gap-3">
            {[2, 0, 1].map((i) => (
              <button
                key={i}
                className="btn-soft text-2xl"
                disabled={d.checked || d.order.includes(i)}
                onClick={() => update({ ...d, order: [...d.order, i] })}
              >
                {d.order.includes(i) ? `${d.order.indexOf(i) + 1}. ` : ''}
                {content.sequence[i]}
              </button>
            ))}
          </div>
          <ol className="space-y-2 text-2xl">
            {d.order.map((i, n) => (
              <li key={i}>
                {n + 1}. {content.sequence[i]}
              </li>
            ))}
          </ol>
          <button className="btn-soft" disabled={d.checked} onClick={() => update({ ...d, order: [] })}>
            순서 다시 놓기
          </button>
        </section>
      )}
      {d.stage < 3 && (
        <>
          {d.checked ? (
            <div className="card bg-green-50 text-2xl">
              <p>잘 생각했어요!</p>
              {question && <p className="my-3">글 속 근거: {question.evidence}</p>}
              <button
                className="btn-green"
                onClick={() => {
                  update({
                    ...d,
                    stage: d.stage + 1,
                    tries: 0,
                    selected: null,
                    checked: false,
                    helped: false,
                    order: [],
                  })
                  setShowText(false)
                }}
              >
                다음 활동 ▶
              </button>
            </div>
          ) : (
            <button
              className="btn-primary"
              disabled={d.stage < 2 ? d.selected === null : d.order.length !== 3}
              onClick={check}
            >
              생각 확인하기
            </button>
          )}
          {d.tries > 0 && !d.checked && (
            <p role="status" className="text-2xl">
              글을 다시 살펴보고 생각해요.
              {d.stage === 2 && d.tries >= 3 ? ` 차례는 ‘${content.sequence.join(' → ')}’예요.` : ''}
            </p>
          )}
          <button
            className="btn-soft ml-3"
            onClick={() => {
              setShowText((v) => !v)
              if (!d.checked) update({ ...d, helped: true })
            }}
          >
            읽은 부분 다시 보기
          </button>
          {showText && (
            <div className="card space-y-2 text-2xl leading-relaxed">
              {book.sentences.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </div>
          )}
        </>
      )}
      {d.stage === 3 && (
        <section className="card space-y-4">
          <h3 className="text-3xl">한 문장으로 설명해요</h3>
          <p className="text-2xl">{content.explain}</p>
          <SpeakButton text={content.explain} />
          <label className="block text-xl" htmlFor="story-reflection">
            내 생각 ({d.submission.reflection.length}/300자)
          </label>
          <textarea
            id="story-reflection"
            className="min-h-36 w-full rounded-xl border-2 border-amber-300 p-4 text-2xl"
            maxLength={300}
            placeholder={content.starter}
            value={d.submission.reflection}
            onChange={(e) => update({ ...d, submission: { ...d.submission, reflection: e.target.value } })}
          />
          <p className="text-lg">혼자 쓰기 어려우면 선생님께 말하고 함께 적어요. 이 답은 선생님이 읽고 확인해요.</p>
          <button
            className="btn-primary"
            disabled={busy || d.submission.reflection.trim().length < 5}
            onClick={() => void save()}
          >
            {busy ? '전하는 중…' : '내 생각 전하기'}
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="text-xl text-red-700">
          {error}
        </p>
      )}
      <button className="btn-soft" onClick={onExit}>
        잠깐 쉬기 · 책 목록
      </button>
      <div className="text-sm">
        <DooruCredit book={book} />
        <p>이해 질문과 순서 활동은 발췌문을 바탕으로 새로 구성했습니다.</p>
      </div>
    </div>
  )
}
