import { useEffect, useRef, useState } from 'react'
import { SpeakButton } from '../components/common'
import { speak, stopSpeaking } from '../lib/tts'
import { useStu } from '../student/ctx'
import { syncMission } from './missionApi'
import { readDraft, writeDraft } from './missionStore'
import { MISSION_NAMES, answerResult, finishedQuestion, type MissionDraft } from './missionTypes'
import type { Option } from '../lib/quiz'
import MissionReward from './MissionReward'
import { checkpointLabel } from './checkpoints'
import MissionScene from './MissionScene'
import MissionQuestion, { questionHint } from './MissionQuestion'
import MissionFeedback from './MissionFeedback'

export default function MissionRunner({
  initial,
  onDone,
  onReset,
}: {
  initial: MissionDraft
  onDone: () => void
  onReset: () => void
}) {
  const { student } = useStu()
  const [draft, setDraft] = useState(initial)
  const ref = useRef(initial)
  const [index, setIndex] = useState(() =>
    initial.run.results.findIndex((r) => !finishedQuestion(r)) < 0
      ? initial.run.results.length - 1
      : initial.run.results.findIndex((r) => !finishedQuestion(r)),
  )
  const [feedback, setFeedback] = useState('')
  const [durable, setDurable] = useState(() => writeDraft(initial))
  const [pending, setPending] = useState(initial.dirty)
  const clickTime = useRef(0)
  const nextLock = useRef(false)
  const run = draft.run
  const q = draft.questions[index]
  const result = run.results[index]
  const done = run.results.filter(finishedQuestion).length
  useEffect(() => {
    if (run.status === 'started') speak(q.audio)
    return () => stopSpeaking()
  }, [q.id, run.status])
  useEffect(() => {
    nextLock.current = false
  }, [index])
  useEffect(() => {
    let alive = true
    const sync = async () => {
      const state = await syncMission(student.id, run.unit_id)
      if (!alive) return
      if (state === 'reset') {
        onReset()
        return
      }
      setPending(state === 'pending')
      const saved = readDraft(student.id, run.unit_id)
      if (!saved) {
        onReset()
        return
      }
      if (saved && (!saved.dirty || saved.run.revision >= ref.current.run.revision)) {
        if (saved.run.item_ids.join() !== ref.current.run.item_ids.join()) {
          const unfinished = saved.run.results.findIndex((r) => !finishedQuestion(r))
          setIndex(unfinished < 0 ? saved.run.results.length - 1 : unfinished)
          setFeedback('')
        }
        ref.current = saved
        setDraft(saved)
      }
    }
    void sync()
    const timer = setInterval(() => void sync(), 5000)
    window.addEventListener('online', sync)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('online', sync)
      stopSpeaking()
    }
  }, [student.id, run.unit_id, onReset])
  const commit = (next: MissionDraft['run']) => {
    const d = {
      ...ref.current,
      run: { ...next, revision: ref.current.run.revision + 1, updated_at: new Date().toISOString() },
      dirty: true,
    }
    ref.current = d
    setDraft(d)
    setDurable(writeDraft(d))
    setPending(true)
    void syncMission(student.id, run.unit_id).then((state) => {
      if (state === 'reset') onReset()
      else setPending(state === 'pending')
    })
  }
  const updateResult = (r: typeof result) => {
    const rows = [...ref.current.run.results]
    rows[index] = r
    commit({ ...ref.current.run, results: rows })
  }
  const pick = (o: Option) => {
    if (
      Date.now() - clickTime.current < 350 ||
      ref.current.run.status !== 'started' ||
      finishedQuestion(ref.current.run.results[index])
    )
      return
    clickTime.current = Date.now()
    updateResult(answerResult(ref.current.run.results[index], o.correct))
    setFeedback(o.correct ? '끝까지 생각해 줘서 고마워!' : o.feedback)
    if (o.correct) speak(q.correctSpeak)
  }
  const hint = () => {
    updateResult({ ...ref.current.run.results[index], hint_used: true })
    setFeedback(questionHint(q))
  }
  const next = () => {
    if (nextLock.current || !finishedQuestion(ref.current.run.results[index])) return
    nextLock.current = true
    if (index === run.results.length - 1) commit({ ...ref.current.run, status: 'completed' })
    else {
      setIndex(index + 1)
      setFeedback('')
    }
  }
  const skip = () => {
    onDone()
  }
  const complete = run.status === 'completed'
  if (run.status === 'skipped')
    return (
      <div className="mission-wrap">
        <p>이 미션은 다음에 만나요.</p>
        <button className="btn-primary" onClick={onDone}>
          지도로 가기
        </button>
      </div>
    )
  return (
    <div className="mission-wrap">
      <header className="mission-header">
        <div>
          <span className="mission-eyebrow">{checkpointLabel(run.unit_id)} · 네 단원 복습</span>
          <h2>{MISSION_NAMES[run.kind]}</h2>
        </div>
        <span className="mission-count">{done} / {run.results.length}</span>
        <button className="mission-skip" onClick={skip}>
          {complete ? '지도로 가기' : '잠깐 쉬기'}
        </button>
      </header>
      <div className="mission-play-layout">
      <MissionScene kind={run.kind} done={done} total={run.results.length} student={student} />
      <div className="mission-task-panel">
      {complete ? (
        <section className="mission-success" aria-live="polite">
          <h3>친구들을 도와줬어. 고마워!</h3>
          <p>{run.results.some((r) => !r.resolved) ? '도움을 받아 함께 배웠어!' : `${run.results.length}문제를 끝까지 풀었어!`}</p>
          <p>평가 결과로 다음 복습을 준비했어요. 지도에서 복습 날짜를 확인해요.</p>
          <MissionReward run={run} pending={pending} />
          <SpeakButton text="친구들을 도와줬어. 고마워!" />
          <button className="btn-primary" onClick={onDone}>
            이제 지도로 가기
          </button>
        </section>
      ) : (
        <>
          <MissionQuestion
            q={q}
            kind={run.kind}
            result={result}
            onPick={pick}
            onHint={hint}
            blocked={finishedQuestion(result)}
          />
          <MissionFeedback
            text={feedback || (result.hint_used && !result.resolved ? questionHint(q) : '')}
            correct={result.resolved}
          />
          {result.tries >= 3 && !finishedQuestion(result) && (
            <button
              className="btn-soft mission-continue"
              onClick={() => {
                speak(`${q.target}. ${q.pron}`)
                updateResult({ ...ref.current.run.results[index], hint_used: true, continued: true })
                setFeedback(questionHint(q))
              }}
            >
              설명을 보고 함께 넘어가기
            </button>
          )}
          {finishedQuestion(result) && (
            <button className="btn-green mission-next" onClick={next}>
              {index === run.results.length - 1 ? '미션 마치기' : '다음 친구 만나기'}
            </button>
          )}
        </>
      )}
      </div></div>
      <p className="mission-save" role="status">
        {!durable
          ? '기기에 저장할 공간이 부족해요. 화면을 닫기 전에 선생님께 알려 주세요.'
          : pending
            ? '기기에 기억했어요. 연결되면 선생님께 전해요.'
            : '선생님께 미션 기록을 전했어요.'}
      </p>
    </div>
  )
}
