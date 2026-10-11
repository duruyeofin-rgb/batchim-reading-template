import { useEffect, useState } from 'react'
import { fmtDate } from '../lib/util'
import { missionUnavailable, teacherMissions } from './missionApi'
import { questionById } from './missionQuestions'
import { MISSION_NAMES, type MissionRun } from './missionTypes'

export default function TeacherMissions({ studentId }: { studentId: string }) {
  const [runs, setRuns] = useState<MissionRun[]>([])
  const [message, setMessage] = useState('미션 기록을 불러오는 중…')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setRuns([])
    setMessage('미션 기록을 불러오는 중…')
    const load = () =>
      teacherMissions(studentId)
        .then((rows) => {
          if (alive) {
            setRuns(rows)
            setMessage(rows.length ? '' : '아직 미션 기록이 없습니다.')
          }
        })
        .catch((e) => {
          if (alive)
            setMessage(
              missionUnavailable(e)
                ? '미션 기록 표가 준비되지 않았습니다. supabase/checkpoint_missions.sql 적용 후 사용할 수 있습니다.'
                : '미션 기록을 가져오지 못했습니다. 다시 불러와 주세요.',
            )
        })
    void load()
    const timer = setInterval(() => void load(), 20000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [studentId, retry])
  return (
    <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-lg">맞춤 미션 기록</h3>
        <button className="tbtn" onClick={() => setRetry((x) => x + 1)}>
          새로고침
        </button>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        네 단원마다 중간 평가를 합니다. 완료하면 직업 도구를 받습니다. 별은 지급하지 않으며 기존 학습 정답률·성장 그래프에 합산하지 않습니다. 도움을 받아 배운 과정도 함께 봐
        주세요.
      </p>
      {message && (
        <p role="status" className="text-sm text-slate-600">
          {message}
        </p>
      )}
      <div className="space-y-3">
        {runs.map((run) => (
          <article key={`${run.assessment ? "checkpoint" : "legacy"}:${run.unit_id}`} className="rounded-xl border bg-white p-3">
            <div className="flex flex-wrap justify-between gap-2 font-semibold">
              <h4>
                {run.assessment ? "중간 평가" : "이전 미션"} · 단원 {run.unit_id} · {MISSION_NAMES[run.kind]}
              </h4>
              <span>{run.status === 'completed' ? '완료' : run.status === 'skipped' ? '건너뜀' : '진행 중'}</span>
            </div>
            <p className="text-xs text-slate-500">{fmtDate(run.updated_at)}</p>
            <p className="my-2 text-sm">추천 이유: {run.reason}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">낱말</th>
                    <th>첫 시도</th>
                    <th>힌트</th>
                    <th>마지막 결과</th>
                  </tr>
                </thead>
                <tbody>
                  {run.results.map((r) => (
                    <tr key={r.item_id} className="border-t">
                      <td className="p-2">{questionById(r.item_id)?.target ?? r.item_id}</td>
                      <td>{r.first_correct === null ? '미응답' : r.first_correct ? '정답' : '오답'}</td>
                      <td>{r.hint_used ? '사용' : '없음'}</td>
                      <td>
                        {r.resolved
                          ? '스스로 선택해 해결'
                          : r.continued
                            ? '설명 후 진행 · 지도 참고'
                            : r.tries
                              ? '연습 중 · 도움 필요'
                              : '미진행'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
