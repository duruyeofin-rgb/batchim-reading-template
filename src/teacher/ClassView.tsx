import TeacherLearning from '../learning/TeacherLearning'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { UNITS, unitLabel } from '../data/curriculum'
import { supabase } from '../lib/supabase'
import QRCode from 'qrcode'
import { fmtDate, joinUrl } from '../lib/util'
import { TAG_HELP, TAG_PASS, TAG_SKIP } from '../lib/helpTags'
import { type Growth, STATUS_LABEL, analyzeGrowth } from '../lib/growth'
import { markHeard } from '../lib/similarity'
import GrowthPanel from './GrowthPanel'
import TeacherMissions from '../mission/TeacherMissions'
import ResetDialog from './ResetDialog'
import { type ResetOptions, failText, resetStudents } from './reset'
import Wishes from './Wishes'
import {
  type AttemptRow,
  type ClassRow,
  type ProgressRow,
  type StudentRow,
  type StudentStat,
  buildCsv,
  buildGrowthCsv,
  type HelpRequest,
  computeStats,
  downloadText,
  loadClassData,
  pendingHelp,
  rate,
  topWrongBatchim,
} from './data'

type SortKey = 'number' | 'status' | 'last' | 'charName' | 'jobLabel' | 'dream' | 'unit' | 'word' | 'sent' | 'read' | 'help'
type FilterKey = 'all' | 'recent' | 'idle' | 'up' | 'repeat' | 'read'
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'recent', label: '최근 학습한 학생' },
  { key: 'idle', label: '최근 학습 없음' },
  { key: 'up', label: '📈 성장 중' },
  { key: 'repeat', label: '🔁 반복 오류' },
  { key: 'read', label: '🙋 읽기 확인 필요' },
]
const STATUS_ORDER = { check: 0, watch: 1, few: 2, stable: 3 } as const
const daysText = (g: Growth) => (g.daysSince === null ? '-' : g.daysSince === 0 ? '오늘' : g.daysSince === 1 ? '어제' : `${g.daysSince}일 전`)

function QrImage({ text, className }: { text: string; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(text, { margin: 1, width: 640, errorCorrectionLevel: 'M' })
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setSrc(''))
    return () => {
      alive = false
    }
  }, [text])
  return src ? <img src={src} alt="학급 입장 QR" className={className} /> : <div className={className} />
}

const rateCls =(v: number | null) => (v !== null && v < 60 ? 'bg-orange-100 font-bold text-orange-700' : '')
const fmtRate = (v: number | null) => (v === null ? '-' : `${v}%`)

export default function ClassView({ cls, onBack, onDeleted }: { cls: ClassRow; onBack: () => void; onDeleted: () => void }) {
  const [data, setData] = useState<{ students: StudentRow[]; progress: ProgressRow[]; attempts: AttemptRow[] } | null>(null)
  const [err, setErr] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'number', dir: 1 })
  const [openId, setOpenId] = useState<string | null>(null)
  const [board, setBoard] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [groupFilter, setGroupFilter] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [resetTarget, setResetTarget] = useState<'class' | StudentRow | null>(null) // 학급 전체, 또는 표에서 고른 한 학생
  const [resetBusy, setResetBusy] = useState(false)
  const [resetErr, setResetErr] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      setData(await loadClassData(cls.id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [cls.id])

  useEffect(() => {
    void load()
  }, [load])

  // 선생님 확인 대기 목록이 바로 보이도록 몇 초마다 조용히 새로고침한다 (화면이 보일 때만)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return
      loadClassData(cls.id)
        .then(setData)
        .catch(() => undefined)
    }, 5000)
    return () => clearInterval(t)
  }, [cls.id])

  const [deciding, setDeciding] = useState<string | null>(null)

  /** 선생님이 읽는 것을 듣고 '통과로 확인' 또는 '넘어가기'를 남긴다. 학생 화면이 몇 초 안에 알아채고 넘어간다 */
  const decide = async (req: HelpRequest, pass: boolean) => {
    setDeciding(req.key + (pass ? ':p' : ':s'))
    const { error } = await supabase.from('attempts').insert({
      student_id: req.student_id,
      class_id: cls.id,
      level: 'paragraph',
      unit_id: req.unit_id,
      item_id: req.item_id,
      target: req.target,
      answer: null,
      is_correct: pass,
      first_try: false,
      similarity: null,
      listened_first: false,
      feedback: pass ? TAG_PASS : TAG_SKIP,
    })
    setDeciding(null)
    if (error) setErr(error.message)
    else await load()
  }

  const stats = useMemo(() => (data ? computeStats(data.students, data.progress, data.attempts) : []), [data])
  const growthMap = useMemo(() => {
    const m = new Map<string, Growth>()
    if (data) {
      for (const s of data.students) {
        m.set(
          s.id,
          analyzeGrowth(
            data.attempts.filter((a) => a.student_id === s.id),
            data.progress.filter((p) => p.student_id === s.id),
          ),
        )
      }
    }
    return m
  }, [data])
  const pending = useMemo(() => (data ? pendingHelp(data.attempts) : []), [data])
  const top = useMemo(() => (data ? topWrongBatchim(data.attempts) : []), [data])

  const sorted = useMemo(() => {
    const val = (s: StudentStat): number | string => {
      switch (sort.key) {
        case 'number': return s.student.number
        case 'status': return STATUS_ORDER[growthMap.get(s.student.id)?.status ?? 'few']
        case 'last': return growthMap.get(s.student.id)?.daysSince ?? 9999
        case 'charName': return s.charName
        case 'jobLabel': return s.jobLabel
        case 'dream': return s.student.dream_total
        case 'unit': return s.currentIdx
        case 'word': return s.wordRate ?? -1
        case 'sent': return s.sentRate ?? -1
        case 'read': return s.readPassed
        default: return s.help
      }
    }
    const keep = (s: StudentStat) => {
      const g = growthMap.get(s.student.id)
      if (!g) return true
      if (filter === 'recent' && !g.studiedRecently) return false
      if (filter === 'idle' && g.daysSince !== null && g.daysSince < 3) return false
      if (filter === 'up' && !(g.trend === 'up' || g.groups.some((x) => x.trend === 'up'))) return false
      if (filter === 'repeat' && g.repeatTargets.length === 0) return false
      if (filter === 'read' && g.reading.pending === 0 && g.reading.needCheck === 0) return false
      if (groupFilter && !g.hardGroups.some((x) => x.group.id === groupFilter)) return false
      if (unitFilter && s.currentUnit !== unitFilter) return false
      return true
    }
    return [...stats].filter(keep).sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')
      return c * sort.dir || a.student.number - b.student.number
    })
  }, [stats, sort, growthMap, filter, groupFilter, unitFilter])

  // 먼저 살펴볼 학생 (교사 확인 → 관찰 순)
  const attention = useMemo(
    () =>
      stats
        .map((s) => ({ s, g: growthMap.get(s.student.id) }))
        .filter((x): x is { s: StudentStat; g: Growth } => !!x.g && (x.g.status === 'check' || x.g.status === 'watch'))
        .sort((a, b) => STATUS_ORDER[a.g.status as 'check' | 'watch'] - STATUS_ORDER[b.g.status as 'check' | 'watch'] || a.s.student.number - b.s.student.number),
    [stats, growthMap],
  )

  const th = (key: SortKey, label: string) => (
    <th className="cursor-pointer whitespace-nowrap px-3 py-2 text-left hover:bg-slate-100" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
      {label} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  )

  const openReset = (t: 'class' | StudentRow) => {
    setResetErr('')
    setResetTarget(t)
  }

  /** 기록 초기화 (학생 번호·학급 코드·QR 은 그대로). 학급 전체와 표에서 고른 한 학생이 같은 길을 쓴다 */
  const confirmReset = async (o: ResetOptions) => {
    if (!data || !resetTarget) return
    const one = resetTarget === 'class' ? null : resetTarget
    const ids = one ? [one.id] : data.students.map((x) => x.id)
    setResetBusy(true)
    setResetErr('')
    try {
      const r = await resetStudents(supabase, ids, o)
      if (!r.ok) {
        setResetErr(failText(r))
        return
      }
      setResetTarget(null)
      setNotice(`${one ? `${one.number}번 학생의` : `학생 ${ids.length}명의`} 기록을 초기화했어요. (${r.done.join(' · ')})`)
      await load()
    } finally {
      setResetBusy(false)
    }
  }

  const deleteClass = async () => {
    if (!window.confirm(`'${cls.name}' 학급과 모든 학생 기록을 삭제할까요? 되돌릴 수 없어요.`)) return
    const { error } = await supabase.from('classes').delete().eq('id', cls.id)
    if (error) setErr(error.message)
    else onDeleted()
  }

  const openStudent = data?.students.find((s) => s.id === openId)
  if (openStudent && data) {
    return (
      <StudentDetail
        student={openStudent}
        progress={data.progress.filter((p) => p.student_id === openStudent.id)}
        attempts={data.attempts.filter((a) => a.student_id === openStudent.id)}
        growth={growthMap.get(openStudent.id) ?? analyzeGrowth([], [])}
        currentUnit={stats.find((x) => x.student.id === openStudent.id)?.currentUnit ?? '-'}
        onBack={() => setOpenId(null)}
        onChanged={async (closeAfter) => {
          await load()
          if (closeAfter) setOpenId(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="tbtn" onClick={onBack}>◀ 학급 목록</button>
        <h2 className="text-2xl font-bold">{cls.name}</h2>
        <span className="rounded-lg bg-amber-100 px-3 py-1 font-mono text-lg tracking-widest">{cls.code}</span>
        <button className="tbtn bg-amber-200" onClick={() => setBoard(true)}>🖥️ 칠판에 띄우기</button>
        <button className="tbtn" onClick={() => data && downloadText(`${cls.name}_결과.csv`, buildCsv(data.students, data.attempts))}>
          ⬇ CSV 내려받기
        </button>
        <button className="tbtn" onClick={() => data && downloadText(`${cls.name}_성장요약.csv`, buildGrowthCsv(data.students, stats, growthMap))}>
          ⬇ 성장 요약 CSV
        </button>
        <button className="tbtn" onClick={() => void load()}>↻ 새로고침</button>
        <button className="tbtn ml-auto text-red-600" disabled={!data || data.students.length === 0} onClick={() => openReset('class')}>학생 전체 기록 초기화</button>
        <button className="tbtn text-red-600" onClick={() => void deleteClass()}>학급 삭제</button>
      </div>

      {err && <p className="rounded bg-red-50 p-3 text-red-700">{err}</p>}
      {notice && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
      {!data && !err && <p>불러오는 중…</p>}

      {data && (
        <>
          <section className={`rounded-xl p-4 shadow-sm ${pending.length ? 'border-2 border-amber-400 bg-amber-50' : 'bg-white'}`}>
            <h3 className="mb-2 font-bold">
              🙋 선생님 확인 대기 {pending.length > 0 ? `(${pending.length})` : ''}
              <span className="ml-2 text-xs font-normal text-slate-500">5초마다 자동으로 새로 고쳐져요</span>
            </h3>
            {pending.length === 0 ? (
              <p className="text-slate-500">지금 기다리는 학생이 없어요. 학생이 한 문장을 3번 읽어도 통과하지 못하면 여기에 나타나요.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((r) => {
                  const num = data.students.find((s) => s.id === r.student_id)?.number
                  return (
                    <li key={r.key} className="rounded-lg bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded bg-amber-200 px-2 py-0.5 text-lg font-bold">{num}번</span>
                        <span className="text-xs text-slate-500">{unitLabel(r.unit_id)}</span>
                        <span className="min-w-[200px] flex-1 text-lg">{r.target}</span>
                        <button
                          className="rounded-lg bg-emerald-500 px-4 py-2 font-bold text-white disabled:opacity-50"
                          disabled={deciding !== null}
                          onClick={() => void decide(r, true)}
                        >
                          ✔ 통과로 확인
                        </button>
                        <button
                          className="rounded-lg bg-slate-200 px-4 py-2 font-bold disabled:opacity-50"
                          disabled={deciding !== null}
                          onClick={() => void decide(r, false)}
                        >
                          → 넘어가기
                        </button>
                      </div>
                      {r.answers.length > 0 && (
                        <p className="mt-1 text-sm text-slate-600">
                          인식된 글자:{' '}
                          {r.answers.map((a, i) => (
                            <span key={i} className="mr-3">
                              {markHeard(r.target, a).map((m, k) => (
                                <span key={k} className={m.bad ? 'font-bold text-red-600' : ''}>{m.ch}</span>
                              ))}
                            </span>
                          ))}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-1 font-bold">먼저 살펴볼 학생</h3>
            <p className="mb-2 text-xs text-slate-500">학생을 평가하는 것이 아니라, 선생님이 어디부터 보면 좋을지 알려 주는 표시예요. 누르면 성장 기록이 열려요.</p>
            {attention.length === 0 ? (
              <p className="text-slate-500">지금 특별히 먼저 살펴볼 학생이 없어요.</p>
            ) : (
              <ul className="space-y-1">
                {attention.map(({ s, g }) => (
                  <li key={s.student.id}>
                    <button className="flex w-full flex-wrap items-center gap-3 rounded-lg px-2 py-1 text-left hover:bg-amber-50" onClick={() => setOpenId(s.student.id)}>
                      <span className="w-12 font-bold">{s.student.number}번</span>
                      <span className="w-28 whitespace-nowrap">{STATUS_LABEL[g.status].icon} {STATUS_LABEL[g.status].text}</span>
                      <span className="flex-1 text-sm text-slate-700">{g.statusReasons[0] ?? STATUS_LABEL[g.status].hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-bold">자주 틀린 받침 TOP 5</h3>
            {top.length === 0 ? (
              <p className="text-slate-500">아직 틀린 기록이 없어요.</p>
            ) : (
              <ol className="flex flex-wrap gap-3">
                {top.map((t, i) => (
                  <li key={t.jong} className="rounded-lg bg-orange-50 px-4 py-2">
                    <span className="text-slate-500">{i + 1}위</span>{' '}
                    <b className="text-2xl text-orange-700">{t.jong}</b> <span>{t.count}번</span>
                    <span className="ml-2 text-sm text-slate-500">({t.examples.join(', ')})</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button key={f.key} className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? 'border-amber-500 bg-amber-100 font-bold' : 'border-slate-300 bg-white'}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
            <select className="rounded-lg border px-2 py-1 text-sm" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="받침 어려움">
              <option value="">받침 어려움: 전체</option>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>{u.jamos} ({u.id})</option>
              ))}
            </select>
            <select className="rounded-lg border px-2 py-1 text-sm" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} aria-label="현재 단원">
              <option value="">현재 단원: 전체</option>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>{u.id}</option>
              ))}
              <option value="완료">완료</option>
            </select>
          </div>

          <section className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  {th('number', '번호')}
                  {th('status', '지도 상태')}
                  {th('charName', '캐릭터')}
                  {th('jobLabel', '직업')}
                  {th('dream', '누적 꿈')}
                  {th('unit', '현재 단원')}
                  {th('last', '최근 학습')}
                  {th('word', '단어 정답률')}
                  {th('sent', '문장 정답률')}
                  {th('read', '읽기 테스트')}
                  {th('help', '확인 대기')}
                  <th className="whitespace-nowrap px-3 py-2 text-left">기록 초기화</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={12} className="p-6 text-center text-slate-500">{stats.length === 0 ? '아직 들어온 학생이 없어요. 학급 코드를 알려 주세요.' : '조건에 맞는 학생이 없어요.'}</td></tr>
                )}
                {sorted.map((s) => (
                  <tr key={s.student.id} className="cursor-pointer border-b hover:bg-amber-50" onClick={() => setOpenId(s.student.id)}>
                    <td className="px-3 py-2 font-bold">{s.student.number}번</td>
                    <td className="whitespace-nowrap px-3 py-2" title={growthMap.get(s.student.id) ? STATUS_LABEL[growthMap.get(s.student.id)!.status].hint : ''}>
                      {growthMap.get(s.student.id) ? `${STATUS_LABEL[growthMap.get(s.student.id)!.status].icon} ${STATUS_LABEL[growthMap.get(s.student.id)!.status].text}` : '-'}
                    </td>
                    <td className="px-3 py-2">{s.charName}</td>
                    <td className="px-3 py-2">{s.jobLabel}</td>
                    <td className="px-3 py-2">⭐ {s.student.dream_total}</td>
                    <td className="px-3 py-2">{s.currentUnit}</td>
                    <td className="whitespace-nowrap px-3 py-2">{growthMap.get(s.student.id) ? daysText(growthMap.get(s.student.id)!) : '-'}</td>
                    <td className={`px-3 py-2 ${rateCls(s.wordRate)}`}>{fmtRate(s.wordRate)}</td>
                    <td className={`px-3 py-2 ${rateCls(s.sentRate)}`}>{fmtRate(s.sentRate)}</td>
                    <td className="px-3 py-2">{s.readPassed > 0 ? `${s.readPassed}권 통과` : '-'}</td>
                    <td className="px-3 py-2">{s.help > 0 ? <span className="rounded bg-red-100 px-2 text-red-700">🙋 {s.help}문장</span> : '-'}</td>
                    <td className="px-3 py-2">
                      <button
                        className="tbtn whitespace-nowrap border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        title={`${s.student.number}번 학생 한 명의 기록만 초기화해요`}
                        aria-label={`${s.student.number}번 학생 기록 초기화`}
                        onClick={(e) => {
                          e.stopPropagation() // 줄을 눌렀을 때 열리는 성장 기록 화면과 구분한다
                          openReset(s.student)
                        }}
                      >
                        초기화
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-xs text-slate-500">정답률은 '처음 시도' 기준이에요. 60% 미만은 주황색으로 표시돼요. 지도 상태는 능력 평가가 아니라 먼저 살펴볼 곳을 알려 주는 표시이고(✅ 안정 · 👀 관찰 · 🔔 교사 확인 · ⏳ 기록 모으는 중), 줄을 누르면 성장 기록이 열려요.</p>
        </>
      )}

      {resetTarget === 'class' && (
        <ResetDialog
          title="학생 전체 기록 초기화"
          lead={`‘${cls.name}’ 학급의 학생 ${data?.students.length ?? 0}명 모두에게 적용돼요. 학생 번호, 학급 코드, QR 은 그대로 쓸 수 있어요.`}
          needWord="초기화"
          busy={resetBusy}
          error={resetErr}
          onCancel={() => {
            if (!resetBusy) setResetTarget(null)
          }}
          onConfirm={(o) => void confirmReset(o)}
        />
      )}
      {resetTarget && resetTarget !== 'class' && (
        <ResetDialog
          key={resetTarget.id}
          title={`${resetTarget.number}번 학생 기록 초기화`}
          lead={`${resetTarget.number}번 학생 한 명의 기록만 처음 상태로 되돌려요. 다른 학생은 그대로이고, 학급 코드와 번호도 그대로예요.`}
          busy={resetBusy}
          error={resetErr}
          onCancel={() => {
            if (!resetBusy) setResetTarget(null)
          }}
          onConfirm={(o) => void confirmReset(o)}
        />
      )}

      {board && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-amber-100 p-4" onClick={() => setBoard(false)}>
          <p className="text-3xl">📱 QR 을 찍거나, 숫자를 눌러요</p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <QrImage text={joinUrl(cls.code)} className="h-[38vh] w-[38vh] rounded-2xl bg-white p-3 shadow" />
            <p className="font-mono text-[14vw] font-black leading-none tracking-[0.12em] text-orange-600">{cls.code}</p>
          </div>
          <p className="text-xl text-slate-600">{cls.name} · 화면을 누르면 닫혀요</p>
        </div>
      )}
    </div>
  )
}

function StudentDetail({
  student,
  progress,
  attempts,
  growth,
  currentUnit,
  onBack,
  onChanged,
}: {
  student: StudentRow
  progress: ProgressRow[]
  attempts: AttemptRow[]
  growth: Growth
  currentUnit: string
  onBack: () => void
  onChanged: (closeAfter: boolean) => Promise<void>
}) {
  const [msg, setMsg] = useState('')

  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>[], closeAfter = false) => {
    if (!window.confirm(label)) return
    const res = await Promise.all(fn())
    const bad = res.find((r) => r.error)
    if (bad?.error) setMsg(bad.error.message)
    else await onChanged(closeAfter)
  }

  const [resetOpen, setResetOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetErr, setResetErr] = useState('')
  const [notice, setNotice] = useState('')
  const [ver, setVer] = useState(0) // 초기화한 뒤 성장 기록·꿈 이야기 칸을 다시 불러오게 한다

  /** 이 학생의 기록을 고른 만큼 초기화 */
  const doReset = async (o: ResetOptions) => {
    setResetBusy(true)
    setResetErr('')
    try {
      const r = await resetStudents(supabase, [student.id], o)
      if (!r.ok) {
        setResetErr(failText(r))
        return
      }
      setResetOpen(false)
      setNotice(`${student.number}번 학생의 기록을 초기화했어요. (${r.done.join(' · ')})`)
      setVer((v) => v + 1)
      await onChanged(false)
    } finally {
      setResetBusy(false)
    }
  }
  const allowJob = () =>
    run(`${student.number}번 학생이 직업을 다시 고르게 할까요?`, () => [
      supabase.from('students').update({ job: null, updated_at: new Date().toISOString() }).eq('id', student.id).then((r) => r),
    ])
  const removeStudent = () =>
    run(`${student.number}번 학생의 기록을 완전히 삭제할까요? 되돌릴 수 없어요.`, () => [
      supabase.from('students').delete().eq('id', student.id).then((r) => r),
    ], true)

  const pRow = (unit: string, level: string) => progress.find((p) => p.unit_id === unit && p.level === level)

  // 문항별 시도 번호
  const seq = new Map<string, number>()
  const withNo = attempts.map((a) => {
    const n = (seq.get(a.item_id) ?? 0) + 1
    seq.set(a.item_id, n)
    return { a, n }
  })
  const wrongs = withNo.filter(({ a }) => a.level !== 'paragraph' && !a.is_correct).reverse()
  const reads = withNo.filter(({ a }) => a.level === 'paragraph').reverse()

  const bar = (v: number | null) => (
    <div className="flex items-center gap-2">
      <div className="h-3 w-28 overflow-hidden rounded bg-slate-100">
        <div className={`h-full ${v !== null && v < 60 ? 'bg-orange-400' : 'bg-emerald-500'}`} style={{ width: `${v ?? 0}%` }} />
      </div>
      <span className={`w-10 text-xs ${v !== null && v < 60 ? 'font-bold text-orange-700' : ''}`}>{fmtRate(v)}</span>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="tbtn" onClick={onBack}>◀ 현황표</button>
        <h2 className="text-2xl font-bold">{student.number}번 학생</h2>
        <span>⭐ 꿈 {student.dream_total}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="tbtn" onClick={() => { setResetErr(''); setResetOpen(true) }}>이 학생 기록 초기화</button>
          <button className="tbtn" onClick={() => void allowJob()}>직업 다시 고르기 허용</button>
          <button className="tbtn text-red-600" onClick={() => void removeStudent()}>학생 기록 삭제</button>
        </div>
      </div>
      {msg && <p className="rounded bg-red-50 p-3 text-red-700">{msg}</p>}
      {notice && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{notice}</p>}

      <GrowthPanel key={`g${ver}`} student={student} growth={growth} currentUnit={currentUnit} />

      <TeacherLearning key={`l${ver}`} studentId={student.id} />
      <TeacherMissions key={`m${ver}`} studentId={student.id} />
      <Wishes key={`w${ver}`} studentId={student.id} />

      {resetOpen && (
        <ResetDialog
          title={`${student.number}번 학생 기록 초기화`}
          lead={`${student.number}번 학생의 기록을 처음 상태로 되돌려요. 학급 코드와 번호는 그대로예요.`}
          busy={resetBusy}
          error={resetErr}
          onCancel={() => {
            if (!resetBusy) setResetOpen(false)
          }}
          onConfirm={(o) => void doReset(o)}
        />
      )}

      <h3 className="pt-2 text-lg font-bold text-slate-600">자세한 기록</h3>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 font-bold">단원별 첫 시도 정답률</h3>
        <table className="text-sm">
          <thead><tr className="text-left text-slate-500"><th className="pr-6">단원</th><th className="pr-6">단어</th><th>문장</th></tr></thead>
          <tbody>
            {UNITS.map((u) => {
              const w = pRow(u.id, 'word')
              const s = pRow(u.id, 'sentence')
              return (
                <tr key={u.id} className="border-t">
                  <td className="py-1 pr-6">{u.id} {u.short}</td>
                  <td className="pr-6">{w ? bar(rate(w.first_try_correct, w.total)) : <span className="text-slate-400">-</span>}</td>
                  <td>{s ? bar(rate(s.first_try_correct, s.total)) : <span className="text-slate-400">-</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 font-bold">오답 기록 ({wrongs.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-slate-500"><th className="p-2">날짜</th><th className="p-2">문제</th><th className="p-2">고른 답</th><th className="p-2">제공된 피드백</th></tr></thead>
            <tbody>
              {wrongs.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">틀린 기록이 없어요.</td></tr>}
              {wrongs.map(({ a }) => (
                <tr key={a.id} className="border-b align-top">
                  <td className="whitespace-nowrap p-2">{fmtDate(a.created_at)}</td>
                  <td className="p-2">{a.target} <span className="text-xs text-slate-400">({unitLabel(a.unit_id).split(' ')[0]})</span></td>
                  <td className="p-2 font-bold text-orange-700">{a.answer}</td>
                  <td className="p-2">{a.feedback}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 font-bold">문단 읽기 기록 ({reads.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-slate-500"><th className="p-2">날짜</th><th className="p-2">원래 문장</th><th className="p-2">인식된 글자</th><th className="p-2">유사도</th><th className="p-2">시도</th><th className="p-2">표시</th></tr></thead>
            <tbody>
              {reads.length === 0 && <tr><td colSpan={6} className="p-3 text-slate-500">아직 문단 읽기 기록이 없어요.</td></tr>}
              {reads.map(({ a, n }) => (
                <tr key={a.id} className="border-b align-top">
                  <td className="whitespace-nowrap p-2">{fmtDate(a.created_at)}</td>
                  <td className="p-2">{a.target}</td>
                  <td className="p-2">
                    {markHeard(a.target, a.answer ?? '').map((m, i) => (
                      <span key={i} className={m.bad ? 'font-bold text-red-600' : ''}>{m.ch}</span>
                    ))}
                  </td>
                  <td className={`p-2 ${a.is_correct ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {a.similarity === null ? '-' : `${Math.round(Number(a.similarity) * 100)}%`}
                  </td>
                  <td className="p-2">{n}번째</td>
                  <td className="p-2 space-x-1">
                    {a.listened_first && <span className="rounded bg-sky-100 px-1.5">듣고 읽음</span>}
                    {a.feedback === TAG_HELP && <span className="rounded bg-red-100 px-1.5 text-red-700">도움 필요</span>}
                    {a.feedback === TAG_PASS && <span className="rounded bg-emerald-100 px-1.5 text-emerald-700">선생님 확인(통과)</span>}
                    {a.feedback === TAG_SKIP && <span className="rounded bg-slate-200 px-1.5">선생님 확인(넘어가기)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
