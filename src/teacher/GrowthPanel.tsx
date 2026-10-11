import { useCallback, useEffect, useState } from 'react'
import { GROWTH_RULES, type Growth, STATUS_LABEL, type SeriesKey, TREND_LABEL, shortDate } from '../lib/growth'
import { fmtDate } from '../lib/util'
import { type NoteRow, addNote, deleteNote, fetchNotes } from './notes'

const SERIES: { key: SeriesKey; label: string }[] = [
  { key: 'all', label: '전체 첫 시도' },
  { key: 'word', label: '단어 첫 시도' },
  { key: 'sentence', label: '문장 첫 시도' },
  { key: 'read', label: '읽기(자동 인식)' },
]

const NOTE_IDEAS = [
  '받침 낱말을 함께 다시 읽음',
  '문장은 잘 읽지만 천천히 읽도록 지도',
  '오늘 읽기는 교사가 직접 확인함',
]

const rateText = (v: number | null) => (v === null ? '-' : `${v}%`)

function lastStudyText(g: Growth) {
  if (g.daysSince === null || g.lastStudyMs === null) return '아직 없어요'
  const when = g.daysSince === 0 ? '오늘' : g.daysSince === 1 ? '어제' : `${g.daysSince}일 전`
  return `${when} (${fmtDate(new Date(g.lastStudyMs).toISOString()).slice(0, 10)})`
}

/** 아주 단순한 꺾은선 그래프 (날짜별 정확도) */
function GrowthChart({ g }: { g: Growth }) {
  const [key, setKey] = useState<SeriesKey>('all')
  const pts = g.series[key].filter((p) => p.rate !== null)
  const W = 560
  const H = 200
  const padL = 36
  const padR = 14
  const padT = 26
  const padB = 34
  const x = (i: number) => (pts.length <= 1 ? (W + padL - padR) / 2 : padL + (i * (W - padL - padR)) / (pts.length - 1))
  const y = (v: number) => padT + ((100 - v) * (H - padT - padB)) / 100
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {SERIES.map((s) => (
          <button
            key={s.key}
            className={`rounded-full border px-3 py-1 text-sm ${key === s.key ? 'border-amber-500 bg-amber-100 font-bold' : 'border-slate-300 bg-white'}`}
            onClick={() => setKey(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {pts.length === 0 ? (
        <p className="rounded bg-slate-50 p-4 text-sm text-slate-500">아직 그래프를 그릴 만큼 기록이 없어요.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px]" role="img" aria-label="날짜별 정확도 그래프">
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray={v === 50 ? '4 4' : undefined} />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{v}%</text>
            </g>
          ))}
          {pts.length > 1 && (
            <polyline fill="none" stroke="#d97706" strokeWidth="2.5" points={pts.map((p, i) => `${x(i)},${y(p.rate ?? 0)}`).join(' ')} />
          )}
          {pts.map((p, i) => (
            <g key={p.day}>
              <circle cx={x(i)} cy={y(p.rate ?? 0)} r="5" fill={p.n >= 5 ? '#d97706' : '#fff'} stroke="#d97706" strokeWidth="2" />
              <text x={x(i)} y={y(p.rate ?? 0) - 9} textAnchor="middle" fontSize="11" fill="#334155">{p.rate}%</text>
              <text x={x(i)} y={H - 16} textAnchor="middle" fontSize="11" fill="#64748b">{shortDate(p.day)}</text>
              <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="9" fill="#94a3b8">{p.n}개</text>
            </g>
          ))}
        </svg>
      )}
      <p className="mt-1 text-xs text-slate-500">
        속이 빈 점은 그날 푼 문제가 5개 미만이라 참고만 해 주세요.
        {key === 'read' && ' 읽기는 브라우저 자동 인식 기준이라, 아이의 읽기 능력을 그대로 뜻하지 않아요.'}
      </p>
    </div>
  )
}

function Notes({ studentId, classId }: { studentId: string; classId: string }) {
  const [rows, setRows] = useState<NoteRow[]>([])
  const [missing, setMissing] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetchNotes(studentId)
    setRows(r.rows)
    setMissing(r.missing)
    setErr(r.error ?? '')
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!text.trim()) return
    setBusy(true)
    setErr('')
    const { error } = await addNote(studentId, classId, text)
    setBusy(false)
    if (error) setErr('저장하지 못했어요: ' + error.message)
    else {
      setText('')
      await load()
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm('이 메모를 지울까요?')) return
    const { error } = await deleteNote(id)
    if (error) setErr(error.message)
    else await load()
  }

  return (
    <div>
      <h4 className="mb-1 font-bold">교사 피드백</h4>
      {missing ? (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
          메모를 저장할 표가 아직 없어요. Supabase 의 SQL Editor 에서 <code>supabase/teacher_notes.sql</code> 내용을 한 번 실행하면 이 칸을 쓸 수 있어요. (다른 기능은 그대로 쓸 수 있어요.)
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">선생님만 볼 수 있어요. 학생 이름 같은 개인 정보는 쓰지 마세요.</p>
          <div className="flex flex-wrap gap-2 pb-2">
            {NOTE_IDEAS.map((t) => (
              <button key={t} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setText((v) => (v ? `${v} ${t}` : t).slice(0, 500))}>
                + {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <textarea
              className="min-h-[64px] min-w-[260px] flex-1 rounded-lg border p-2 text-sm"
              placeholder="예: ㄺ 받침 낱말(닭, 읽다, 맑다)을 함께 다시 읽음"
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="rounded-lg bg-amber-400 px-4 py-2 font-bold disabled:opacity-50" disabled={busy || !text.trim()} onClick={() => void save()}>
              기록하기
            </button>
          </div>
        </>
      )}
      {err && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map((n) => (
            <li key={n.id} className="flex items-start gap-3 border-t pt-2 text-sm">
              <span className="w-32 shrink-0 text-xs text-slate-500">{fmtDate(n.created_at)}</span>
              <span className="flex-1 whitespace-pre-wrap">{n.note}</span>
              <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => void remove(n.id)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
      {!missing && rows.length === 0 && <p className="mt-2 text-sm text-slate-500">아직 남긴 메모가 없어요.</p>}
    </div>
  )
}

/** 학생 상세 맨 위 「받침 성장 기록」 — 10~20초 안에 변화와 다음 지도를 알 수 있게 */
export default function GrowthPanel({
  student,
  growth: g,
  currentUnit,
}: {
  student: { id: string; class_id: string; number: number }
  growth: Growth
  currentUnit: string
}) {
  const st = STATUS_LABEL[g.status]
  const none = g.changes.better.length + g.changes.hard.length + g.changes.fresh.length === 0
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="text-xl font-bold">받침 성장 기록</h3>

      {/* 1. 지금 상태 */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 font-bold" title={st.hint}>
          {st.icon} {st.text}
        </span>
        <span className="text-xs text-slate-500">능력 평가가 아니라, 선생님이 먼저 살펴볼 곳을 알려 주는 표시예요.</span>
      </div>
      <p className="mt-2 text-lg leading-snug">{g.summary}</p>
      {g.statusReasons.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
          {g.statusReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {/* 2. 최근 학습 */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 text-sm sm:grid-cols-4">
        <div><dt className="text-slate-500">최근 학습</dt><dd className="font-bold">{lastStudyText(g)}</dd></div>
        <div><dt className="text-slate-500">현재 단원</dt><dd className="font-bold">{currentUnit}</dd></div>
        <div><dt className="text-slate-500">최근 단어 첫 시도</dt><dd className="font-bold">{rateText(g.wordRecent)}</dd></div>
        <div><dt className="text-slate-500">최근 문장 첫 시도</dt><dd className="font-bold">{rateText(g.sentRecent)}</dd></div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-slate-500">읽기 (자동 인식 기준)</dt>
          <dd>
            읽은 책 통과 <b>{g.reading.booksPassed}권</b> · 자동 인식으로 통과한 문장 <b>{g.reading.passed}</b>/{g.reading.attempted}
            {g.reading.needCheck > 0 && <> · 자동 인식에서 확인이 필요했던 문장 <b>{g.reading.needCheck}</b></>}
            {g.reading.pending > 0 && <> · <b className="text-red-700">지금 확인 대기 {g.reading.pending}</b></>}
            {(g.reading.teacherPassed > 0 || g.reading.teacherSkipped > 0) && (
              <> · 교사 확인: 통과 {g.reading.teacherPassed}, 넘어가기 {g.reading.teacherSkipped}</>
            )}
          </dd>
        </div>
      </dl>

      {/* 3. 최근 변화 */}
      <div className="mt-4 border-t pt-3">
        <h4 className="mb-1 font-bold">최근 변화</h4>
        {none ? (
          <p className="text-sm text-slate-500">
            {g.eventCount < 12 ? '아직 비교할 만큼 기록이 쌓이지 않았어요.' : '눈에 띄는 변화는 아직 없어요.'}
          </p>
        ) : (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            {g.changes.better.length > 0 && (
              <div>
                <p className="mb-1 font-bold text-emerald-700">📈 좋아진 부분</p>
                <ul className="space-y-1">{g.changes.better.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            {g.changes.hard.length > 0 && (
              <div>
                <p className="mb-1 font-bold text-orange-700">🔁 계속 어려워하는 부분</p>
                <ul className="space-y-1">{g.changes.hard.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            {g.changes.fresh.length > 0 && (
              <div>
                <p className="mb-1 font-bold text-sky-700">🆕 새롭게 나타난 어려움</p>
                <ul className="space-y-1">{g.changes.fresh.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {g.fixedRate !== null && (
          <p className="mt-2 text-sm text-slate-600">
            첫 시도에 틀린 문제를 다시 풀어서 맞힌 비율은 <b>{g.fixedRate}%</b>예요.
          </p>
        )}
      </div>

      {/* 4. 다음 지도 추천 */}
      <div className="mt-4 rounded-lg bg-amber-50 p-3">
        <h4 className="mb-1 font-bold">다음 지도 추천 <span className="text-xs font-normal text-slate-500">· 선생님 판단을 돕는 참고예요</span></h4>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {g.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      {/* 5. 그래프 */}
      <div className="mt-4 border-t pt-3">
        <h4 className="mb-2 font-bold">시간에 따른 변화</h4>
        <GrowthChart g={g} />
      </div>

      {/* 6. 받침별 변화 */}
      <div className="mt-4 border-t pt-3">
        <h4 className="mb-2 font-bold">받침별 변화</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-1 pr-4">받침</th>
                <th className="pr-4">초기</th>
                <th className="pr-4">최근</th>
                <th>변화</th>
              </tr>
            </thead>
            <tbody>
              {g.groups.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-slate-500">아직 받침별로 볼 기록이 없어요.</td></tr>
              )}
              {g.groups.map((r) => (
                <tr key={r.group.id} className="border-b">
                  <td className="py-1 pr-4 font-bold">{r.group.label} <span className="text-xs font-normal text-slate-400">({r.group.id})</span></td>
                  <td className="pr-4">{r.early === null ? '-' : `${r.early}%`}</td>
                  <td className="pr-4">{r.recent === null ? '-' : `${r.recent}%`}</td>
                  <td>
                    {r.trend === 'few' ? (
                      <span className="text-slate-500">아직 판단하기 위한 학습 기록이 충분하지 않습니다 ({r.n}문제)</span>
                    ) : (
                      <>
                        {TREND_LABEL[r.trend]}
                        {r.repeatTargets.length > 0 && <span className="ml-2 text-orange-700">· 교사 확인 추천 (‘{r.repeatTargets.slice(0, 3).join(', ')}’)</span>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-slate-500">같은 받침 묶음에서 첫 시도 {GROWTH_RULES.minEventsPerGroup}문제 이상, 학습을 2번 이상 나누어 푼 기록이 있을 때만 변화를 말해요.</p>
      </div>

      {/* 7. 교사 피드백 */}
      <div className="mt-4 border-t pt-3">
        <Notes studentId={student.id} classId={student.class_id} />
      </div>
    </section>
  )
}
