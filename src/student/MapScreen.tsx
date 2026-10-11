import { useEffect, useState } from 'react'
import { learningContext } from '../learning/api'
import ReviewHub from '../learning/ReviewHub'
import { UNITS } from '../data/curriculum'
import { SpeakButton } from '../components/common'
import { isPassed, unitOpen, unitPassed, useStu } from './ctx'
import { CHECKPOINTS, checkpointEligible, checkpointLabel, checkpointUnits } from '../mission/checkpoints'

export default function MapScreen({
  onUnit,
  onDone,
  onReadTest,
  onMission,
  onReview,
}: {
  onUnit: (id: string) => void
  onDone: () => void
  onReadTest: () => void
  onReview?: (id: string) => void
  onMission: (id: string) => void
}) {
  const { student, progress, world } = useStu()
  const [practiced, setPracticed] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    const refresh = () => learningContext(student.id).then(c => { if (alive) setPracticed(c.practice) }).catch(() => undefined)
    void refresh()
    const timer = setInterval(() => void refresh(),30000)
    window.addEventListener('online',refresh)
    return () => { alive=false; clearInterval(timer); window.removeEventListener('online',refresh) }
  }, [student.id])
  const part1 = UNITS.filter((u) => u.part === 1)
  const part2 = UNITS.filter((u) => u.part === 2)

  const tile = (u: (typeof UNITS)[number]) => {
    const idx = UNITS.indexOf(u)
    const open =
      unitPassed(progress, u.id) || (unitOpen(progress, idx) && (idx === 0 || practiced.includes(UNITS[idx - 1].id)))
    const passed = unitPassed(progress, u.id)
    const wordDone = isPassed(progress, u.id, 'word')
    return (
      <button
        key={u.id}
        disabled={!open}
        onClick={() => onUnit(u.id)}
        className={`relative flex min-h-[120px] flex-col items-center justify-center rounded-3xl border-4 px-2 py-3 shadow-[0_6px_0_rgba(0,0,0,0.12)] transition active:translate-y-1 ${
          passed
            ? 'border-leaf bg-green-50'
            : open
              ? 'border-sun bg-white ' + 'bob'
              : 'border-slate-200 bg-slate-100 opacity-60'
        }`}
      >
        <span className="text-lg text-[#7a6248]">{u.id}</span>
        <span className="text-4xl text-batchim">{u.short}</span>
        <span className="mt-1 text-xl">
          {passed
            ? practiced.includes(u.id)
              ? '✅ 통과'
              : '새 낱말 읽기'
            : open
              ? wordDone
                ? '문장 도전'
                : '도전!'
              : '🔒'}
        </span>
      </button>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4">
      <div className="flex items-center gap-3 text-3xl">
        <span>🗺️ 받침 여행 지도</span>
        <SpeakButton text="받침 여행 지도. 열려 있는 단원을 눌러요" size="sm" />
      </div>

      {onReview && <ReviewHub onReview={onReview} />}
      <section>
        <h3 className="mb-2 text-2xl text-[#7a6248]">1부. 받침은 달라도 소리는 같아요</h3>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">{part1.map(tile)}</div>
      </section>

      <section>
        <h3 className="mb-2 text-2xl text-[#7a6248]">2부. 겹받침 알아보기</h3>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">{part2.map(tile)}</div>
      </section>

      <section className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-4">
        <h3 className="text-2xl">🎁 네 단원마다 중간 평가</h3>
        <p className="mb-3 text-lg text-[#7a6248]">
          네 단원의 듣기·받침 채우기·새 문장 읽기를 마치면, 미션을 풀고 내 직업의 꿈 도구를 얻어요.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {CHECKPOINTS.map((u) => (
            <button
              key={u.id}
              className="btn-soft text-xl"
              disabled={
                !checkpointEligible(u, [...progress.values()]) ||
                !checkpointUnits(u).every((x) => practiced.includes(x.id))
              }
              onClick={() => onMission(u.id)}
            >
              {checkpointLabel(u.id)}
              <span className="block text-base">
                단원 {checkpointUnits(u)[0].id} ~ {u.id}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-wrap items-center gap-4">
        <button className="btn-green text-3xl" onClick={onReadTest}>
          🎤 읽기 테스트
        </button>
        {world.complete && (
          <button className="btn-primary text-3xl" onClick={onDone}>
            🌈 꿈 완성 보기
          </button>
        )}
      </section>
    </div>
  )
}
