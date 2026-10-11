import { useEffect, useState } from 'react'
import { unitById } from '../data/curriculum'
import { useStu } from '../student/ctx'
import { koreaDay } from './content'
import { learningContext, pendingLearning, type LearningContext } from './api'
export default function ReviewHub({ onReview }: { onReview: (id: string) => void }) {
  const { student } = useStu(),
    [ctx, setCtx] = useState<LearningContext | null>(null),
    [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    const run = () =>
      learningContext(student.id)
        .then((c) => {
          if (alive) {
            setCtx(c)
            setError(false)
          }
        })
        .catch(() => alive && setError(true))
    void run()
    const t = setInterval(() => void run(), 30000)
    window.addEventListener('online', run)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener('online', run)
    }
  }, [student.id])
  const today = koreaDay(),
    schedules = ctx?.schedules ?? [],
    pending = pendingLearning(student.id),
    due = schedules.filter((s) => s.due_on && s.due_on <= today && !pending.some(
      p => p.kind === 'review' && p.unit === s.unit_id && p.round === s.round && p.epoch === ctx?.epoch,
    )),
    future = schedules.filter((s) => s.due_on && s.due_on > today).sort((a, b) => a.due_on!.localeCompare(b.due_on!))
  return (
    <section className="rounded-3xl border-2 border-teal-300 bg-teal-50 p-5 space-y-3">
      <h3 className="text-3xl">🌱 다시 만나는 복습</h3>
      <p className="text-xl">배운 뒤 다음 날·3일 뒤·일주일 뒤에 만나요. 어려웠던 받침은 더 자주 연습해요.</p>
      {error ? (
        <p role="status">복습 날짜를 불러오지 못했어요. 연결되면 다시 확인해요.</p>
      ) : !ctx ? (
        <p>복습 날짜를 확인해요…</p>
      ) : due.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {due.map((s) => (
            <button key={s.unit_id} className="btn-green text-2xl" onClick={() => onReview(s.unit_id)}>
              {unitById(s.unit_id)?.short} 복습하기
              <span className="block text-base">
                {s.weak.length ? '어려웠던 받침을 한 번 더' : '다른 낱말과 문장으로'}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-2xl">
          {schedules.length ? '오늘 예정된 복습을 모두 마쳤어요.' : '단원을 마치면 복습 날짜가 생겨요.'}
        </p>
      )}
      {future.length > 0 && (
        <p className="text-xl">
          다음 복습: {future[0].due_on} ·{' '}
          {future
            .filter((s) => s.due_on === future[0].due_on)
            .map((s) => unitById(s.unit_id)?.short)
            .join(', ')}{' '}
          (한국 날짜)
        </p>
      )}
    </section>
  )
}
