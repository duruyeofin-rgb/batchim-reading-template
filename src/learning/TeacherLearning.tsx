import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { unitById } from '../data/curriculum'
import { bookByUnitId } from '../data/dooru'
import type { LearningResult, ReviewSchedule } from './api'
type Row = {
  id: string
  unit_id: string
  kind: string
  results: LearningResult[]
  reflection: string
  created_at: string
}
export default function TeacherLearning({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<Row[]>([]),
    [schedules, setSchedules] = useState<ReviewSchedule[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const fetch = async () => {
      const [a, b] = await Promise.all([
        supabase
          .from('learning_sessions')
          .select('id,unit_id,kind,results,reflection,created_at')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('learning_schedule').select('*').eq('student_id', studentId),
      ])
      if (!alive) return
      if (a.error || b.error) {
        setError('심화·복습 기록을 불러오지 못했습니다.')
        return
      }
      setRows(a.data ?? [])
      setSchedules(b.data ?? [])
      setError('')
    }
    void fetch()
    const t = setInterval(() => void fetch(), 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [studentId])
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm space-y-3">
      <h3 className="text-lg font-bold">깊이 익히기 · 복습 · 이야기 이해</h3>
      {error && <p role="alert">{error}</p>}
      <p className="text-sm text-slate-600">
        읽기 이해 점수와 자유 서술은 분리됩니다. 한 문장 설명은 아래에서 내용을 읽고 학생과 확인해 주세요.
      </p>
      <div className="flex flex-wrap gap-2">
        {schedules.map((s) => (
          <span key={s.unit_id} className="rounded bg-teal-50 p-2 text-sm">
            {unitById(s.unit_id)?.short}: {s.due_on ?? '일주일 복습 완료'}
            {s.weak.length ? ' · 보충 복습' : ''}
          </span>
        ))}
      </div>
      {rows.length === 0 && !error && <p>아직 새 활동 기록이 없습니다.</p>}
      <div className="max-h-[650px] overflow-auto space-y-3">
        {rows.map((r) => (
          <article key={r.id} className="rounded-lg border p-3">
            <p className="font-bold">
              {r.kind === 'story' ? bookByUnitId(r.unit_id)?.title : `단원 ${r.unit_id}`} ·{' '}
              {r.kind === 'story' ? '이야기 생각하기' : r.kind === 'review' ? '날짜별 복습' : '깊이 익히기'}
            </p>
            <p className="text-sm text-slate-600">
              {new Date(r.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · 스스로 해결{' '}
              {r.results.filter((x) => x.first && !x.helped && x.passed).length}/{r.results.length} · 도움/재시도{' '}
              {r.results.filter((x) => x.helped || !x.first).length}
            </p>
            {r.reflection && (
              <div className="mt-2 rounded bg-amber-50 p-3">
                <p className="text-sm">학생의 한 문장 · 교사 확인용</p>
                <p className="whitespace-pre-wrap">{r.reflection}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
