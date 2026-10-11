import { useEffect, useRef, useState } from 'react'
import type { Unit } from '../data/curriculum'
import { SpeakButton } from '../components/common'
import { flush, pendingCount } from '../lib/queue'
import { useStu } from '../student/ctx'
import { loadMission, missionHistory, missionUnavailable, syncMission } from './missionApi'
import { readDraft, writeDraft } from './missionStore'
import { selectMission } from './missionSelector'
import { missionQuestions } from './missionQuestions'
import { emptyResult, MISSION_NAMES, type MissionDraft } from './missionTypes'
import MissionRunner from './MissionRunner'
import MissionScene from './MissionScene'
import './missions.css'
import { checkpointEligible, checkpointLabel, checkpointUnits, nextMissionTool } from './checkpoints'
import { eulReul } from '../lib/hangul'
import { imgTool } from '../data/items'

export default function MissionGate({
  unit,
  currentWrong,
  onNext,
  onReset,
}: {
  unit: Unit
  currentWrong: string[]
  onNext: () => void
  onReset: () => void
}) {
  const { student, progress } = useStu()
  const [draft, setDraft] = useState<MissionDraft | null>(null)
  const [playing, setPlaying] = useState(false)
  const [message, setMessage] = useState('친구들의 소식을 가져오고 있어요…')
  const [retry, setRetry] = useState(0)
  const actionLock = useRef(false)
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext
  useEffect(() => {
    let alive = true
    const prepare = async () => {
      try {
        if (!checkpointEligible(unit, [...progress.values()])) { onReset(); return }
        await flush()
        const context = await loadMission(student.id, unit.id)
        if (!alive) return
        if (!context.eligible) {
          onReset()
          return
        }
        if (context.run?.status === 'skipped') {
          onNextRef.current()
          return
        }
        if (context.draft) {
          if (context.draft.run.status === 'skipped') {
            void syncMission(student.id, unit.id)
            onNextRef.current()
            return
          }
          setDraft(context.draft)
          setPlaying(true)
          return
        }
        // No offline creation before the word-progress record reaches the server.
        if (pendingCount() > 0) {
          setMessage('학습 기록을 전하는 중이에요. 잠시 뒤 다시 만나거나 지도로 가도 좋아요.')
          return
        }
        let history = [] as Awaited<ReturnType<typeof missionHistory>>
        try {
          history = await missionHistory(student.id)
        } catch {
          /* current-unit common review, not a weakness inference */
        }
        if (!alive) return
        const choice = selectMission(unit, history, [...progress.values()], currentWrong)
        const questions = missionQuestions(unit, choice)
        const now = new Date().toISOString()
        setDraft({
          run: {
            student_id: student.id,
            class_id: student.class_id,
            unit_id: unit.id,
            epoch: context.epoch,
            kind: choice.kind,
            reason: choice.reason,
            status: 'started',
            item_ids: questions.map((q) => q.id),
            results: questions.map((q) => emptyResult(q.id)),
            revision: 1,
            started_at: now,
            updated_at: now,
          },
          questions,
          dirty: true,
        })
      } catch (e) {
        if (!alive) return
        const local = readDraft(student.id, unit.id)
        if (local && local.run.status === 'started' && !missionUnavailable(e as { code?: string })) {
          setDraft(local)
          setPlaying(true)
        } else if (missionUnavailable(e as { code?: string })) {
          onNextRef.current()
        } else setMessage('친구들의 소식을 아직 가져오지 못했어요. 다시 만나거나 지도로 가도 좋아요.')
      }
    }
    void prepare()
    return () => {
      alive = false
    }
  }, [student.id, unit.id, retry]) // Snapshot selection once; updates to stars must not regenerate questions.
  const begin = () => {
    if (!draft || actionLock.current) return
    actionLock.current = true
    const next = { ...draft, run: { ...draft.run, status: 'started' as const } }
    writeDraft(next)
    void syncMission(student.id, unit.id)
    setDraft(next)
    setPlaying(true)
  }
  if (playing && draft) return <MissionRunner initial={draft} onDone={onNext} onReset={onReset} />
  if (!draft)
    return (
      <section className="mission-wrap mission-loading">
        <p role="status">{message}</p>
        <div>
          <button className="btn-soft" onClick={() => setRetry((x) => x + 1)}>
            다시 만나기
          </button>
          <button className="btn-primary" onClick={onNext}>
            지도로 가기
          </button>
        </div>
      </section>
    )
  return (
    <section className="mission-wrap">
      <header className="mission-header">
        <div>
          <span className="mission-eyebrow">단원 {checkpointUnits(unit)[0].id} ~ {unit.id} 완료</span>
          <h2>{checkpointLabel(unit.id)} 미션!</h2>
        </div>
        <span className="mission-count">12문제</span>
      </header>
      <div className="mission-play-layout">
      <MissionScene kind={draft.run.kind} done={0} total={12} student={student} />
      <div className="mission-invite">
        <span className="mission-eyebrow">{MISSION_NAMES[draft.run.kind]}</span>
        <h3>친구들을 도와줄래?</h3>
        <p>
          {draft.run.kind === 'rescue'
            ? '낱말을 읽고 방울 속 친구를 구해 줘.'
            : draft.run.kind === 'treasure'
              ? '낱말을 읽고 자물쇠를 차례로 열어 줘.'
              : '동물 친구들이 병원에 갈 수 있게 도와줘.'}
        </p>
        <p>네 단원에서 듣기·받침 채우기·문장 읽기를 세 문제씩 풀어요. 어려웠던 받침은 내일 다시 만나요.</p>
        {nextMissionTool(student.job, student.items) && (() => {
          const tool = nextMissionTool(student.job, student.items)!
          return <div className="mission-prize-preview"><img src={imgTool(tool.job, tool.idx)} alt={tool.name} /><p>끝까지 풀면 <b>{tool.name}</b>{eulReul(tool.name)} 얻어요!</p></div>
        })()}
        <SpeakButton text="중간 평가 미션이 도착했어! 친구들을 도와줄래?" />
        <div>
          <button className="btn-soft" onClick={onNext}>
            나중에 할래
          </button>
          <button className="btn-primary" onClick={() => begin()}>
            좋아! 도와줄게
          </button>
        </div>
      </div>
      </div>
    </section>
  )
}
