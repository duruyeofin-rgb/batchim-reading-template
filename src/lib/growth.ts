// 받침 성장 기록 계산 (화면과 분리한 순수 계산 모듈).
//
// 원칙
//  - 기존 attempts 기록에서 계산만 한다(새 값을 저장하지 않는다). 첫 시도·재시도·단원·시각이 이미 들어 있다.
//  - 학생을 평가하지 않는다. "관찰 가능한 사실"과 "교사가 먼저 살펴볼 곳"만 알려 준다.
//  - 기록이 적으면 판단하지 않는다("기록 부족").
//  - 읽기(음성 인식) 결과는 능력으로 보지 않고 "자동 인식에서 확인 필요"로만 다룬다.
import { UNITS } from '../data/curriculum'
import { TAG_HELP, isTeacherTag, pendingHelp } from './helpTags'

/** 성장 계산에 필요한 attempts 한 줄의 최소 모양 */
export interface GAttempt {
  id: number
  student_id: string
  level: string
  unit_id: string
  item_id: string
  target: string
  answer: string | null
  is_correct: boolean
  first_try: boolean
  feedback: string | null
  created_at: string
}

export interface GProgress {
  unit_id: string
  level: string
  passed: boolean
}

// ───────── 기준값 (여기만 고치면 판정이 바뀐다) ─────────
export const GROWTH_RULES = {
  sessionGapMin: 30, // 이 시간(분) 넘게 쉬면 새 학습 회차
  minEventsForSummary: 12, // 전체 첫 시도 기록이 이보다 적으면 성장 요약을 하지 않는다
  minEventsPerGroup: 8, // 받침 묶음 변화를 말하려면 필요한 첫 시도 수
  changeThreshold: 15, // 초기→최근 정답률 차이(%p)가 이 이상이면 오르내림으로 본다
  steadyRate: 85, // 최근 정답률이 이 이상이면 익숙한 것으로 본다
  practiceRate: 70, // 최근 정답률이 이 미만이면 연습이 더 필요한 것으로 본다
  repeatItemSessions: 2, // 같은 낱말을 서로 다른 회차에서 첫 시도에 틀리면 '반복 오류 낱말'
  gapPoints: 20, // 단어와 문장 정답률 차이(%p)
  gapMinEvents: 8, // 단어·문장 각각 필요한 첫 시도 수
  inactiveDays: 7, // 이만큼 학습이 없으면 '오랫동안 학습 없음'
  recentDays: 3, // 이 안에 학습했으면 '최근 학습'
  trendDays: 3, // 변화를 볼 최근 학습일 수
  trendMinEventsPerDay: 5,
  fixedMinWrong: 6, // 고쳐 푸는 힘을 말하려면 필요한 첫 시도 오답 수
} as const

const R = GROWTH_RULES

// ───────── 날짜 도구 ─────────
const MS_DAY = 86_400_000
const dayKey = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const shortDate = (key: string) => {
  const [, m, d] = key.split('-')
  return `${Number(m)}/${Number(d)}`
}
const pct = (ok: number, n: number) => (n > 0 ? Math.round((ok / n) * 100) : null)

// ───────── 받침 묶음 ─────────
export interface BatchimGroup {
  id: string // 단원 번호 (예: 1-3)
  label: string // 받침 글자 (예: ㄷ ㅅ ㅆ …)
}
export const groupOfUnit = (unitId: string): BatchimGroup | null => {
  const u = UNITS.find((x) => x.id === unitId)
  return u ? { id: u.id, label: u.jamos } : null
}

// ───────── 회차(세션) 만들기 ─────────
export interface ItemResult {
  itemId: string
  target: string
  firstCorrect: boolean | null // 첫 시도 정오 (첫 시도 기록이 없으면 null)
  finalCorrect: boolean // 같은 회차 안에서 결국 맞혔는가
  tries: number
}

export interface Session {
  unitId: string
  level: 'word' | 'sentence'
  start: number
  end: number
  day: string
  items: ItemResult[]
}

export function buildSessions(attempts: GAttempt[]): Session[] {
  const rows = attempts
    .filter((a) => (a.level === 'word' || a.level === 'sentence') && groupOfUnit(a.unit_id))
    .sort((a, b) => a.id - b.id)
  const sessions: Session[] = []
  let cur: Session | null = null
  let curMap = new Map<string, ItemResult>()
  for (const a of rows) {
    const t = new Date(a.created_at).getTime()
    const sameFlow =
      cur && cur.unitId === a.unit_id && cur.level === a.level && t - cur.end <= R.sessionGapMin * 60_000
    if (!cur || !sameFlow) {
      cur = { unitId: a.unit_id, level: a.level as 'word' | 'sentence', start: t, end: t, day: dayKey(t), items: [] }
      curMap = new Map()
      sessions.push(cur)
    }
    cur.end = t
    let it = curMap.get(a.item_id)
    if (!it) {
      it = { itemId: a.item_id, target: a.target, firstCorrect: a.first_try ? a.is_correct : null, finalCorrect: false, tries: 0 }
      curMap.set(a.item_id, it)
      cur.items.push(it)
    }
    it.tries++
    if (a.is_correct) it.finalCorrect = true
  }
  return sessions
}

// ───────── 첫 시도 사건 ─────────
interface Ev {
  t: number
  day: string
  ok: boolean
  level: 'word' | 'sentence'
  unitId: string
  itemId: string
  target: string
  sessionIdx: number
  fixed: boolean // 첫 시도에 틀렸지만 같은 회차에서 결국 맞힘
}

function eventsOf(sessions: Session[]): Ev[] {
  const out: Ev[] = []
  sessions.forEach((s, i) => {
    for (const it of s.items) {
      if (it.firstCorrect === null) continue
      out.push({
        t: s.start,
        day: s.day,
        ok: it.firstCorrect,
        level: s.level,
        unitId: s.unitId,
        itemId: it.itemId,
        target: it.target,
        sessionIdx: i,
        fixed: !it.firstCorrect && it.finalCorrect,
      })
    }
  })
  return out
}

const rateOf = (evs: Ev[]) => pct(evs.filter((e) => e.ok).length, evs.length)

// ───────── 날짜별 그래프 점 ─────────
export interface DayPoint {
  day: string
  label: string
  n: number
  rate: number | null
}
export type SeriesKey = 'word' | 'sentence' | 'all' | 'read'
export type Series = Record<SeriesKey, DayPoint[]>

function seriesOf(evs: Ev[], attempts: GAttempt[]): Series {
  const byDay = (list: Ev[]): DayPoint[] => {
    const m = new Map<string, Ev[]>()
    for (const e of list) m.set(e.day, [...(m.get(e.day) ?? []), e])
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, l]) => ({ day, label: shortDate(day), n: l.length, rate: rateOf(l) }))
  }
  // 읽기: 그날 시도한 문장 중 자동 인식으로 통과한 문장 비율 (능력 평가가 아니라 자동 인식 기록)
  const reads = attempts.filter((a) => a.level === 'paragraph' && !isTeacherTag(a.feedback))
  const rm = new Map<string, Map<string, boolean>>()
  for (const a of reads) {
    const day = dayKey(new Date(a.created_at).getTime())
    const m = rm.get(day) ?? new Map<string, boolean>()
    m.set(a.item_id, (m.get(a.item_id) ?? false) || a.is_correct)
    rm.set(day, m)
  }
  const read: DayPoint[] = [...rm.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, m]) => ({ day, label: shortDate(day), n: m.size, rate: pct([...m.values()].filter(Boolean).length, m.size) }))
  return {
    word: byDay(evs.filter((e) => e.level === 'word')),
    sentence: byDay(evs.filter((e) => e.level === 'sentence')),
    all: byDay(evs),
    read,
  }
}

// ───────── 받침 묶음별 변화 ─────────
export type GroupTrend = 'few' | 'up' | 'steady' | 'same' | 'down' | 'practice'
export interface GroupRow {
  group: BatchimGroup
  n: number
  early: number | null
  recent: number | null
  trend: GroupTrend
  repeatTargets: string[] // 서로 다른 회차에서 첫 시도에 틀렸고, 가장 최근에도 아직 틀리는 낱말
  stuckTargets: string[] // 그중 3개 회차 이상 계속 틀린 낱말
  recentWrong: number // 최근 3회차에서 첫 시도 오답 수
}

export const TREND_LABEL: Record<GroupTrend, string> = {
  few: '아직 기록이 적어요',
  up: '↑ 좋아지고 있어요',
  steady: '→ 안정적이에요',
  same: '→ 비슷해요',
  down: '↓ 살펴보면 좋아요',
  practice: '→ 연습이 더 필요해요',
}

function groupRows(evs: Ev[]): GroupRow[] {
  const rows: GroupRow[] = []
  for (const u of UNITS) {
    const g: BatchimGroup = { id: u.id, label: u.jamos }
    const list = evs.filter((e) => e.unitId === u.id).sort((a, b) => a.t - b.t)
    if (list.length === 0) continue
    // 같은 낱말을 서로 다른 회차에서 첫 시도에 틀렸고, 가장 최근에도 여전히 틀리는가 (나중에 맞혔다면 반복 오류로 보지 않는다)
    const wrongSessions = new Map<string, { target: string; sessions: Set<number>; lastOk: boolean }>()
    for (const e of list) {
      const w = wrongSessions.get(e.itemId) ?? { target: e.target, sessions: new Set<number>(), lastOk: true }
      if (!e.ok) w.sessions.add(e.sessionIdx)
      w.lastOk = e.ok // 시간 순으로 돌기 때문에 마지막 값이 가장 최근 결과
      wrongSessions.set(e.itemId, w)
    }
    const unresolved = [...wrongSessions.values()].filter((w) => !w.lastOk && w.sessions.size >= R.repeatItemSessions)
    const repeatTargets = unresolved.map((w) => w.target)
    const stuckTargets = unresolved.filter((w) => w.sessions.size >= 3).map((w) => w.target)
    const sess = [...new Set(list.map((e) => e.sessionIdx))].slice(-3)
    const recentWrong = list.filter((e) => !e.ok && sess.includes(e.sessionIdx)).length
    let trend: GroupTrend = 'few'
    let early: number | null = null
    let recent: number | null = null
    const distinctSessions = new Set(list.map((e) => e.sessionIdx)).size
    // 한 번의 학습만으로는 변화를 판단하지 않는다
    if (list.length >= R.minEventsPerGroup && distinctSessions >= 2) {
      // 초기와 최근은 '문제 개수'가 아니라 '학습 회차'로 나눈다 (한 회차 안의 문제 순서가 변화처럼 보이지 않게)
      const order = [...new Set(list.map((e) => e.sessionIdx))]
      const h = Math.max(1, Math.floor(order.length / 2))
      const earlySet = new Set(order.slice(0, h))
      const recentSet = new Set(order.slice(-h))
      early = rateOf(list.filter((e) => earlySet.has(e.sessionIdx)))
      recent = rateOf(list.filter((e) => recentSet.has(e.sessionIdx)))
      const d = (recent ?? 0) - (early ?? 0)
      if (d >= R.changeThreshold) trend = 'up'
      else if (d <= -R.changeThreshold) trend = 'down'
      else if ((recent ?? 0) >= R.steadyRate) trend = 'steady'
      else if ((recent ?? 0) < R.practiceRate) trend = 'practice'
      else trend = 'same'
    }
    rows.push({ group: g, n: list.length, early, recent, trend, repeatTargets, stuckTargets, recentWrong })
  }
  return rows
}

// ───────── 한 학생의 성장 분석 ─────────
export type GrowthStatus = 'stable' | 'watch' | 'check' | 'few'
export const STATUS_LABEL: Record<GrowthStatus, { icon: string; text: string; hint: string }> = {
  stable: { icon: '✅', text: '안정', hint: '특별한 반복 오류 없이 학습이 진행 중이에요' },
  watch: { icon: '👀', text: '관찰', hint: '일부 받침에서 반복 오류가 있거나 성장이 주춤해요' },
  check: { icon: '🔔', text: '교사 확인', hint: '읽기 확인 대기가 있거나 같은 오류가 여러 번 반복돼요' },
  few: { icon: '⏳', text: '기록 모으는 중', hint: '학습 기록이 아직 적어요' },
}

export interface Growth {
  eventCount: number
  sessionCount: number
  lastStudyMs: number | null
  daysSince: number | null
  studiedRecently: boolean
  /** 최근 학습일 몇 번의 전체 첫 시도 정답률 (오래된 것 → 최근) */
  recentDays: DayPoint[]
  trend: 'up' | 'down' | 'flat' | 'unknown'
  overall: number | null // 전체 첫 시도 정답률
  wordRecent: number | null
  sentRecent: number | null
  fixedRate: number | null // 첫 시도에 틀린 문제를 같은 회차에 다시 풀어 맞힌 비율
  fixedTrend: 'up' | 'flat' | 'unknown'
  groups: GroupRow[]
  hardGroups: GroupRow[] // 반복 오류가 있거나 연습이 더 필요한 받침 묶음
  repeatTargets: string[]
  wordSentGap: boolean
  series: Series
  reading: {
    attempted: number // 시도한 문장 수
    passed: number // 자동 인식으로 통과한 문장 수
    needCheck: number // '도움 필요' 표시가 있었던 문장 수
    pending: number // 지금 교사 확인을 기다리는 문장 수
    teacherPassed: number
    teacherSkipped: number
    booksPassed: number
  }
  status: GrowthStatus
  statusReasons: string[]
  summary: string
  changes: { better: string[]; hard: string[]; fresh: string[] }
  tips: string[]
}

export function analyzeGrowth(attempts: GAttempt[], progress: GProgress[] = [], now: number = Date.now()): Growth {
  const sessions = buildSessions(attempts)
  const evs = eventsOf(sessions)
  const series = seriesOf(evs, attempts)
  const groups = groupRows(evs)

  // 학습 시기
  const times = attempts.map((a) => new Date(a.created_at).getTime())
  const lastStudyMs = times.length ? Math.max(...times) : null
  const daysSince = lastStudyMs === null ? null : Math.floor((new Date(dayKey(now)).getTime() - new Date(dayKey(lastStudyMs)).getTime()) / MS_DAY)
  const studiedRecently = daysSince !== null && daysSince <= R.recentDays - 1

  // 최근 학습일 변화
  const goodDays = series.all.filter((p) => p.n >= R.trendMinEventsPerDay)
  const recentDays = goodDays.slice(-R.trendDays)
  let trend: Growth['trend'] = 'unknown'
  if (recentDays.length >= 3) {
    const [a, b, c] = recentDays.map((p) => p.rate ?? 0)
    if (a < b && b < c) trend = 'up'
    else if (a > b && b > c) trend = 'down'
    else trend = 'flat'
  }

  // 단어·문장 최근 정답률 (각각 최근 15개 첫 시도)
  const lastN = (level: 'word' | 'sentence') => evs.filter((e) => e.level === level).sort((a, b) => a.t - b.t).slice(-15)
  const wl = lastN('word')
  const sl = lastN('sentence')
  const wordRecent = wl.length >= 5 ? rateOf(wl) : null
  const sentRecent = sl.length >= 5 ? rateOf(sl) : null
  const wordSentGap =
    wl.length >= R.gapMinEvents &&
    sl.length >= R.gapMinEvents &&
    (rateOf(wl) ?? 0) - (rateOf(sl) ?? 0) >= R.gapPoints

  // 틀려도 다시 풀어 고치는 힘
  const wrong = evs.filter((e) => !e.ok)
  const fixedRate = wrong.length >= R.fixedMinWrong ? pct(wrong.filter((e) => e.fixed).length, wrong.length) : null
  let fixedTrend: Growth['fixedTrend'] = 'unknown'
  if (wrong.length >= R.fixedMinWrong * 2) {
    const h = Math.floor(wrong.length / 2)
    const a = pct(wrong.slice(0, h).filter((e) => e.fixed).length, h) ?? 0
    const b = pct(wrong.slice(h).filter((e) => e.fixed).length, wrong.length - h) ?? 0
    fixedTrend = b - a >= 10 ? 'up' : 'flat'
  }

  // 읽기
  const reads = attempts.filter((a) => a.level === 'paragraph')
  const readItems = new Set(reads.map((a) => a.item_id))
  const passedItems = new Set(reads.filter((a) => a.is_correct && !isTeacherTag(a.feedback)).map((a) => a.item_id))
  const helpItems = new Set(reads.filter((a) => a.feedback === TAG_HELP).map((a) => a.item_id))
  const pending = pendingHelp(attempts)
  const reading = {
    attempted: readItems.size,
    passed: passedItems.size,
    needCheck: helpItems.size,
    pending: pending.length,
    teacherPassed: reads.filter((a) => a.feedback === '선생님 확인(통과)').length,
    teacherSkipped: reads.filter((a) => a.feedback === '선생님 확인(넘어가기)').length,
    booksPassed: progress.filter((p) => p.level === 'paragraph' && p.passed && p.unit_id.startsWith('read-')).length,
  }

  // 반복 오류 / 연습 필요한 묶음
  const repeatTargets = [...new Set(groups.flatMap((g) => g.repeatTargets))]
  const hardGroups = groups.filter(
    (g) => g.repeatTargets.length > 0 || g.trend === 'practice' || g.trend === 'down',
  )

  const overall = evs.length ? rateOf(evs) : null
  const enough = evs.length >= R.minEventsForSummary

  // 상태 (업무 보조 표시: 능력 평가가 아니다)
  const statusReasons: string[] = []
  let status: GrowthStatus
  // '같은 오류가 여러 번 반복': 아직도 틀리는 반복 낱말이 2개 이상이거나, 3개 회차 이상 계속 틀리는 낱말이 있을 때
  const repeatGroupsStrong = groups.filter((g) => g.repeatTargets.length >= 2 || g.stuckTargets.length >= 1)
  const recognitionDoubt = reading.needCheck >= 2 && (overall ?? 0) >= R.steadyRate
  if (reading.pending > 0) statusReasons.push(`읽기 확인 대기 ${reading.pending}문장`)
  if (recognitionDoubt) statusReasons.push('자동 인식에서 확인이 필요한 문장이 여러 개 있어요')
  for (const g of repeatGroupsStrong) statusReasons.push(`${g.group.label} 받침에서 같은 오류가 반복돼요`)
  if (statusReasons.length > 0) {
    status = 'check'
  } else if (!enough) {
    status = 'few'
  } else {
    if (repeatTargets.length > 0) statusReasons.push('같은 낱말을 다시 틀린 기록이 있어요')
    for (const g of groups) if (g.trend === 'down') statusReasons.push(`${g.group.label} 받침 정답률이 내려갔어요`)
    if (trend === 'down') statusReasons.push('최근 학습에서 첫 시도 정답률이 내려가고 있어요')
    if (wordSentGap) statusReasons.push('단어보다 문장에서 어려워해요')
    if (daysSince !== null && daysSince >= R.inactiveDays) statusReasons.push(`${daysSince}일째 학습 기록이 없어요`)
    status = statusReasons.length > 0 ? 'watch' : 'stable'
  }

  // 최근 변화 문장
  const better: string[] = []
  const hard: string[] = []
  const fresh: string[] = []
  if (trend === 'up' && recentDays.length >= 3) {
    better.push(`최근 세 번의 학습에서 첫 시도 정답률이 ${recentDays.map((p) => `${p.rate}%`).join(' → ')}로 올라가고 있어요.`)
  }
  for (const g of groups) {
    if (g.trend === 'up' && g.early !== null && g.recent !== null) {
      better.push(`${g.group.label} 받침 낱말의 첫 시도 정답률이 ${g.early}% → ${g.recent}%로 좋아지고 있어요.`)
    }
  }
  if (fixedTrend === 'up') better.push('처음에 틀려도 다시 풀어서 고치는 비율이 높아지고 있어요.')
  for (const g of groups) {
    if (g.repeatTargets.length > 0) {
      hard.push(`${g.group.label} 받침: ‘${g.repeatTargets.slice(0, 3).join(', ')}’ 낱말을 서로 다른 학습에서 계속 틀리고 있어요.`)
    } else if (g.trend === 'practice' && g.recent !== null) {
      hard.push(`${g.group.label} 받침: 최근 첫 시도 정답률이 ${g.recent}%예요.`)
    }
  }
  if (wordSentGap) hard.push('단어에서는 잘 읽지만 문장 안에서는 받침을 놓치는 경우가 있어요.')
  // 새롭게 나타난 어려움: 최근 회차에서 처음 나타난 오답 묶음
  const lastSessions = [...new Set(evs.map((e) => e.sessionIdx))].slice(-2)
  for (const g of groups) {
    const gEv = evs.filter((e) => e.unitId === g.group.id)
    const older = gEv.filter((e) => !lastSessions.includes(e.sessionIdx))
    const newer = gEv.filter((e) => lastSessions.includes(e.sessionIdx))
    if (older.length >= 5 && newer.length >= 3 && (rateOf(older) ?? 0) >= R.steadyRate && (rateOf(newer) ?? 0) < R.practiceRate) {
      fresh.push(`${g.group.label} 받침에서 최근 새롭게 어려움이 나타났어요 (${rateOf(older)}% → ${rateOf(newer)}%).`)
    }
  }

  // 한 줄 요약
  let summary: string
  if (!enough) {
    summary = '학습 기록이 아직 적어 성장 추세를 판단하기 어렵습니다.'
  } else {
    const parts: string[] = []
    if (trend === 'up') parts.push('최근 세 번의 학습에서 첫 시도 정답률이 계속 올라가고 있어요.')
    else if (trend === 'down') parts.push('최근 세 번의 학습에서 첫 시도 정답률이 조금씩 내려가고 있어요.')
    const hards = hardGroups.map((g) => g.group.label)
    const ups = groups.filter((g) => (g.trend === 'up' || g.trend === 'steady') && !hards.includes(g.group.label)).map((g) => g.group.label)
    if (wordSentGap) parts.push('단어 읽기는 안정적이지만 문장에서는 아직 받침을 놓치는 경우가 있어요.')
    if (parts.length < 2 && ups.length > 0 && hards.length > 0) {
      parts.push(`${ups[0]} 받침은 안정되고 있으며, ${hards[0]} 받침은 조금 더 연습하면 좋겠어요.`)
    } else if (parts.length < 2 && hards.length > 0) {
      parts.push(`${hards[0]} 받침에서 반복 오류가 보여요.`)
    } else if (parts.length < 2 && ups.length > 0) {
      parts.push(`${ups[0]} 받침은 안정되고 있어요.`)
    }
    if (parts.length === 0) parts.push('최근 학습은 비슷한 수준으로 이어지고 있어요.')
    summary = parts.slice(0, 2).join(' ')
  }

  // 다음 지도 추천 (규칙 기반, 교사 판단을 돕는 참고 정보)
  const tips: string[] = []
  if (reading.pending > 0) tips.push(`읽기 확인 대기 ${reading.pending}문장이 있어요. 먼저 확인해 주세요.`)
  if (recognitionDoubt) tips.push('음성 인식 오류 가능성이 있어요. 교사가 직접 읽기를 확인해 주세요.')
  if (!enough) {
    tips.push('학습 기록이 더 쌓이면 추천을 보여 드려요.')
  } else {
    for (const g of hardGroups.slice(0, 2)) {
      const words = g.repeatTargets.length > 0 ? g.repeatTargets.slice(0, 3).join(', ') : ''
      tips.push(
        words
          ? `${g.group.label} 받침이 들어간 ‘${words}’ 같은 낱말을 함께 다시 읽어 보세요.`
          : `${g.group.label} 받침이 들어간 익숙한 낱말 3개를 다시 읽어 보세요.`,
      )
    }
    if (wordSentGap) tips.push('낱말 읽기는 안정적입니다. 같은 받침이 들어간 짧은 문장 읽기로 연결해 보세요.')
    if ((overall ?? 100) < 70 && fixedRate !== null && fixedRate >= 70) {
      tips.push('처음에는 망설이지만 다시 생각해서 고치는 힘이 나타나고 있어요. 천천히 한 번 더 생각해 보도록 격려해 주세요.')
    }
    if (daysSince !== null && daysSince >= R.inactiveDays) tips.push('최근 학습 기록이 없어요. 학습 시간을 함께 챙겨 주세요.')
    if (tips.length === 0) tips.push('지금처럼 이어 가도록 격려해 주세요. 새 받침 단원으로 넘어가도 좋아요.')
  }

  return {
    eventCount: evs.length,
    sessionCount: sessions.length,
    lastStudyMs,
    daysSince,
    studiedRecently,
    recentDays,
    trend,
    overall,
    wordRecent,
    sentRecent,
    fixedRate,
    fixedTrend,
    groups,
    hardGroups,
    repeatTargets,
    wordSentGap,
    series,
    reading,
    status,
    statusReasons,
    summary,
    changes: { better, hard, fresh },
    tips: tips.slice(0, 4),
  }
}
