import { retryLearning } from '../learning/api'
import Practice from '../learning/Practice'
import StoryActivities from '../learning/StoryActivities'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Character from '../components/Character'
import { Confetti, Footer, SetupNotice, SpeakButton } from '../components/common'
import { unitById } from '../data/curriculum'
import { DOORU_BOOKS, readUnitId } from '../data/dooru'
import { worldState } from '../data/dreamWorld'
import { isGender, jobById } from '../data/items'
import { euroRo, iGa } from '../lib/hangul'
import {
  type ProgressRow,
  type Student,
  fetchProgress,
  fetchOwnStudent,
  patchStudent,
  clearSavedLogin,
} from '../lib/api'
import { flush, pendingCount } from '../lib/queue'
import { useLocation } from 'react-router-dom'
import MissionGate from '../mission/MissionGate'
import { safeToCompare, serverStateDiffers } from '../lib/sync'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { TTS_SILENT_EVENT, stopSpeaking } from '../lib/tts'
import { retryStudentMissions } from '../mission/missionApi'
import DreamBox from './DreamBox'
import Login from './Login'
import MapScreen from './MapScreen'
import { CharacterPicker, JobPicker } from './Pickers'
import ReadTest, { DooruCredit } from './ReadTest'
import { StoryReader } from './Story'
import UnitPlay from './UnitPlay'
import WishBox from './WishBox'
import { Ctx, type StudentCtx, pkey, useStu } from './ctx'

type Screen =
  | { n: 'boot' }
  | { n: 'login' }
  | { n: 'map' }
  | { n: 'unit'; id: string }
  | { n: 'mission'; id: string }
  | { n: 'dream' }
  | { n: 'readtest' }
  | { n: 'readbook'; dir: number }
  | { n: 'understand'; dir: number }
  | { n: 'review'; id: string }

export default function StudentApp() {
  const location = useLocation()
  const [screen, setScreen] = useState<Screen>({ n: 'boot' })
  const entryRef = useRef(0)
  const [entry, setEntry] = useState(0)
  const [student, setStudentState] = useState<Student | null>(null)
  const [progress, setProgress] = useState<Map<string, ProgressRow>>(new Map())
  const [ticketAlert, setTicketAlert] = useState(false)
  // 꿈 상자는 화면 위에 덮어 열어서, 풀던 단원이 그대로 남아 있게 한다 (닫으면 하던 자리로 돌아간다)
  const [boxView, setBoxView] = useState<null | 'box' | 'job'>(null)
  const openBox = () => {
    stopSpeaking()
    setBoxView('box')
  }
  const [noVoice, setNoVoice] = useState(false)
  const sref = useRef<Student | null>(null)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const lastWrite = useRef(0) // 이 기기에서 마지막으로 학생 값(별·직업 등)을 바꾼 때

  // 🔊 를 눌렀는데 소리가 시작되지 않으면 선생님께 알려 주는 안내를 띄운다
  useEffect(() => {
    const on = () => setNoVoice(true)
    window.addEventListener(TTS_SILENT_EVENT, on)
    return () => window.removeEventListener(TTS_SILENT_EVENT, on)
  }, [])

  const setStudent = (s: Student | null) => {
    sref.current = s
    setStudentState(s)
  }

  const enter = useCallback(async (s: Student) => {
    const currentEntry = entryRef.current
    setStudent(s)
    let rows: ProgressRow[] = []
    try {
      rows = await fetchProgress(s.id)
    } catch { /* 진도는 다음 연결 때 다시 읽는다. */ }
    // 새 입장 화면을 연 뒤 도착한 이전 학생의 응답은 화면을 되돌리지 않는다.
    if (currentEntry !== entryRef.current || sref.current?.id !== s.id) return
    setProgress(new Map(rows.map((r) => [pkey(r.unit_id, r.level), r])))
    setScreen({ n: 'map' })
  }, [])

  // QR·직접 주소·새로고침 모두 빈 학급 코드부터 시작한다.
  // 인증 세션과 학습 기록은 유지하지만, 저장된 학급·학생 번호로 자동 입장하지 않는다.
  const boot = useCallback(() => {
    entryRef.current += 1
    setEntry(entryRef.current)
    clearSavedLogin()
    stopSpeaking()
    setStudent(null)
    setProgress(new Map())
    setBoxView(null)
    setTicketAlert(false)
    setScreen({ n: 'login' })
  }, [])

  useLayoutEffect(() => {
    boot()
  }, [boot, location.key, location.pathname, location.search])

  useEffect(() => {
    // 브라우저의 뒤로/앞으로 가기로 메모리 속 학생 화면이 복원되는 경우도 새 입장이다.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) boot() }
    window.addEventListener('pageshow', restored)
    return () => window.removeEventListener('pageshow', restored)
  }, [boot])

  // 교사가 이 학생의 기록을 초기화하거나 직업을 되돌렸으면, 켜 둔 기기도 서버 값으로 맞춘다.
  // (그냥 두면 기기에 남은 예전 별이 다음에 저장될 때 초기화한 값을 덮어쓴다)
  // 보낼 기록이 없고 이 기기에서 값을 바꾼 지 8초 넘었을 때만 비교한다.
  const studentId = student?.id
  useEffect(() => {
    if (!studentId) return
    const retry = () => {
      void retryStudentMissions(studentId)
      void retryLearning(studentId)
    }
    retry()
    const timer = setInterval(retry, 15000)
    window.addEventListener('online', retry)
    return () => { clearInterval(timer); window.removeEventListener('online', retry) }
  }, [studentId])
  useEffect(() => {
    if (!studentId) return
    let alive = true
    const check = async () => {
      const cur = sref.current
      if (!alive || !cur || document.hidden) return
      if (!safeToCompare(pendingCount(), lastWrite.current, Date.now())) return
      const server = await fetchOwnStudent(cur.id)
      const now = sref.current
      if (!alive || !server || !now || now.id !== server.id) return
      if (!safeToCompare(pendingCount(), lastWrite.current, Date.now())) return // 확인하는 사이에 바뀌었으면 다음에
      let progressReset = false
      try {
        const serverProgress = await fetchProgress(cur.id)
        const serverKeys = new Set(serverProgress.map(p => pkey(p.unit_id, p.level)))
        progressReset = [...progressRef.current.keys()].some(k => !serverKeys.has(k))
      } catch { /* retry on the next successful connection */ }
      if (!alive || sref.current?.id !== cur.id || !safeToCompare(pendingCount(), lastWrite.current, Date.now())) return
      if (progressReset || serverStateDiffers(now, server)) {
        setBoxView(null)
        setTicketAlert(false)
        await enter(server) // 진도도 다시 읽고 지도 화면으로 (캐릭터·직업이 비면 다시 고르게 된다)
      }
    }
    const timer = setInterval(() => void check(), 20000)
    const onVisible = () => {
      if (!document.hidden) void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [studentId, enter])

  const updateStudent: StudentCtx['updateStudent'] = (patch) => {
    const cur = sref.current
    if (!cur) return
    lastWrite.current = Date.now()
    setStudent({ ...cur, ...patch })
    patchStudent(cur.id, patch)
  }

  const earnDream = () => {
    const cur = sref.current
    if (!cur) return
    lastWrite.current = Date.now()
    const next = { ...cur, dream_total: cur.dream_total + 1 }
    setStudent(next)
    patchStudent(cur.id, { dream_total: next.dream_total })
    // 다음 꿈 요소를 열 수 있게 되었으면 알려 준다 (문제를 푸는 중에는 방해하지 않고, 지도로 돌아왔을 때 보여 준다)
    if (!worldState(cur, progress).canOpen && worldState(next, progress).canOpen) setTicketAlert(true)
  }

  const setProgressRow = (row: ProgressRow) => {
    lastWrite.current = Date.now()
    // 이야기 읽기를 통과해서 다음 꿈 요소가 열리게 되면 알려 준다
    const cur = sref.current
    if (cur) {
      const m = new Map(progress)
      m.set(pkey(row.unit_id, row.level), row)
      if (!worldState(cur, progress).canOpen && worldState(cur, m).canOpen) setTicketAlert(true)
    }
    setProgress((p) => {
      const m = new Map(p)
      m.set(pkey(row.unit_id, row.level), row)
      return m
    })
  }

  // 직업을 고르거나 바꿀 때: 모은 별과 읽은 이야기는 그대로 이어진다 (산 것이 아니라 공부한 만큼 쌓인 것이므로)
  const pickJob = (id: string) => updateStudent({ job: id })

  const switchFriend = async () => {
    stopSpeaking()
    await flush()
    clearSavedLogin()
    try {
      await supabase.auth.signOut()
    } catch {
      /* ignore */
    }
    setStudent(null)
    setProgress(new Map())
    setTicketAlert(false)
    setScreen({ n: 'login' })
  }

  const ctx: StudentCtx | null = useMemo(
    () =>
      student
        ? { student, progress, world: worldState(student, progress), earnDream, updateStudent, setProgressRow,
            refreshStudent: async () => {
              const fresh = await fetchOwnStudent(student.id)
              if (fresh && sref.current?.id === fresh.id) setStudent(fresh)
            } }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [student, progress],
  )

  const shell = (body: React.ReactNode, bar = true) => (
    <div className="flex min-h-screen flex-col">
      {bar && student && <TopBar
          onBox={openBox}
          onMap={() => {
            setBoxView(null)
            setScreen({ n: 'map' })
          }}
          onSwitch={switchFriend}
        />}
      {noVoice && (
        <div className="bg-red-50 px-4 py-2 text-center text-lg text-red-700">
          🔇 소리가 나지 않아요. 기기 소리를 키우거나 선생님께 알려 주세요.
          <span className="block text-sm">
            (설정 → 접근성(또는 일반 관리) → 텍스트 음성 변환 → 한국어 음성 설치, 그다음 크롬을 다시 열어요)
          </span>
        </div>
      )}
      <main className="flex flex-1 flex-col">{body}</main>
      <Footer />
    </div>
  )

  if (!supabaseConfigured) return shell(<SetupNotice />, false)

  if (screen.n === 'boot') return shell(<p className="m-auto text-4xl bob">🌈 불러오는 중…</p>, false)

  if (screen.n === 'login' || !student || !ctx)
    return shell(<Login key={entry} onJoined={(s) => { if (entry === entryRef.current) void enter(s) }} />, false)

  // 처음 1번: 캐릭터 → 직업 (교사가 직업을 초기화하면 직업만 다시 고름)
  if (!isGender(student.character))
    return (
      <Ctx.Provider value={ctx}>
        {shell(<CharacterPicker onPick={(id) => updateStudent({ character: id })} />, false)}
      </Ctx.Provider>
    )
  if (!student.job)
    return (
      <Ctx.Provider value={ctx}>
        {shell(<JobPicker character={student.character} onPick={pickJob} />, false)}
      </Ctx.Provider>
    )

  let body: React.ReactNode
  switch (screen.n) {
    case 'unit': {
      const unit = unitById(screen.id)
      body = unit ? <UnitPlay key={unit.id} unit={unit} onExit={() => setScreen({ n: 'map' })} onMission={() => setScreen({ n: 'mission', id: unit.id })} /> : null
      break
    }
    case 'mission': {
      const unit = unitById(screen.id)
      body = unit ? <MissionGate key={unit.id} unit={unit} currentWrong={[]} onNext={() => setScreen({ n: 'map' })} onReset={() => setScreen({ n: 'map' })} /> : null
      break
    }
    case 'review': {
      const unit = unitById(screen.id)
      body = unit ? <Practice key={unit.id} unit={unit} review onDone={() => setScreen({n:'map'})} onExit={() => setScreen({n:'map'})}/> : null
      break
    }
    case 'understand': {
      const book = DOORU_BOOKS.find(b => b.dir === screen.dir)
      body = book ? <StoryActivities key={book.dir} book={book} onExit={() => setScreen({n:'readtest'})}/> : null
      break
    }
    case 'readtest':
      body = (
        <ReadTest
          onThink={(b) => setScreen({n:'understand',dir:b.dir})}
          onOpen={(b) => setScreen({ n: 'readbook', dir: b.dir })}
          onBack={() => setScreen({ n: 'map' })}
        />
      )
      break
    case 'readbook': {
      const b = DOORU_BOOKS.find((x) => x.dir === screen.dir)
      body = b ? (
        <StoryReader
          key={readUnitId(b)}
          story={{ id: readUnitId(b), title: b.title, sentences: b.sentences }}
          label={`읽기 ${b.level}단계 · ${b.title}`}
          backLabel="◀ 읽기 테스트"
          onExit={() => setScreen({ n: 'readtest' })}
          onNext={() => setScreen({n:'understand',dir:b.dir})}
          nextLabel="이야기 생각하기 ▶"
          credit={<DooruCredit book={b} />}
        />
      ) : null
      break
    }
    case 'dream':
      body = <DreamDone onBack={() => setScreen({ n: 'map' })} />
      break
    default:
      body = (
        <MapScreen
          onReview={(id) => setScreen({n:'review',id})}
          onMission={(id) => setScreen({ n: 'mission', id })}
          onUnit={(id) => setScreen({ n: 'unit', id })}
          onDone={() => setScreen({ n: 'dream' })}
          onReadTest={() => setScreen({ n: 'readtest' })}
        />
      )
  }

  const content = (
    <>
      <div className={boxView ? 'hidden' : 'flex flex-1 flex-col'}>{body}</div>
      {boxView === 'box' && (
        <DreamBox
          onBack={() => setBoxView(null)}
          onChangeJob={() => setBoxView('job')}
          onReadTest={() => {
            setBoxView(null)
            setScreen({ n: 'readtest' })
          }}
          onComplete={() => {
            setBoxView(null)
            setScreen({ n: 'dream' })
          }}
        />
      )}
      {boxView === 'job' && (
        <ChangeJob
          character={student.character}
          current={student.job}
          onPick={(id) => {
            pickJob(id)
            setBoxView('box')
          }}
          onCancel={() => setBoxView('box')}
        />
      )}
    </>
  )

  return (
    <Ctx.Provider value={ctx}>
      {shell(content)}
      {ticketAlert && screen.n === 'map' && !boxView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="pop card relative flex max-w-md flex-col items-center gap-4 text-center">
            <Confetti />
            <div className="bob text-8xl">🎁</div>
            <p className="text-4xl">새로운 꿈이 열렸어요!</p>
            <SpeakButton text="새로운 꿈이 열렸어요! 꿈 상자에서 열어 봐요" />
            <div className="flex gap-3">
              <button className="btn-soft" onClick={() => setTicketAlert(false)}>
                계속하기
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setTicketAlert(false)
                  openBox()
                }}
              >
                꿈 상자 열기
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

function TopBar({ onBox, onMap, onSwitch }: { onBox: () => void; onMap: () => void; onSwitch: () => void }) {
  const { student, world } = useStu()
  const job = jobById(student.job)
  return (
    <header className="flex flex-wrap items-center gap-3 bg-sun/30 px-4 py-2">
      <button onClick={onMap} className="flex items-center gap-2" aria-label="지도로">
        <Character character={student.character} job={student.job} items={student.items} showBg={false} className="h-16 rounded-xl" />
        <span className="text-xl">
          {job?.emoji} {student.number}번
        </span>
      </button>
      <span className="rounded-full bg-white px-4 py-1 text-2xl">⭐ 별 {student.dream_total}</span>
      <span className="text-lg text-[#7a6248]">
        {world.complete
          ? '꿈의 세계를 모두 열었어요! 🎉'
          : world.canOpen
            ? '🎁 새로운 꿈이 열렸어요!'
            : world.needStars > 0
              ? `다음 꿈까지 별 ${world.needStars}개`
              : `이야기를 ${world.needReads}권 더 읽어 보아요`}
      </span>
      <button className="btn-soft ml-auto min-h-[48px] px-4 text-xl" onClick={onBox}>
        🎁 꿈 상자{world.canOpen ? ' ✨' : ''}
      </button>
      <button className="rounded-lg px-2 py-1 text-sm text-[#9b8366] underline" onClick={onSwitch}>
        친구 바꾸기
      </button>
    </header>
  )
}

/** 꿈 직업 바꾸기: 산 아이템은 그대로 두고 직업만 바꾼다 (확인을 한 번 더 받는다) */
function ChangeJob({
  character,
  current,
  onPick,
  onCancel,
}: {
  character: string | null
  current: string | null
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const [ask, setAsk] = useState<string | null>(null)
  const next = jobById(ask)
  return (
    <>
      <JobPicker character={character} current={current} onPick={setAsk} onCancel={onCancel} />
      {next && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="pop card flex max-w-md flex-col items-center gap-4 text-center">
            <p className="text-3xl">꿈을 ‘{next.label}’{euroRo(next.label)} 바꿀까요?</p>
            <p className="text-xl text-[#7a6248]">지금까지 산 아이템은 그대로 있어요.</p>
            <div className="flex gap-3">
              <button className="btn-soft" onClick={() => setAsk(null)}>
                아니요
              </button>
              <button className="btn-primary" onClick={() => onPick(next.id)}>
                네, 바꿀래요!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DreamDone({ onBack }: { onBack: () => void }) {
  const { student } = useStu()
  const job = jobById(student.job)
  return (
    <div className="relative mx-auto flex max-w-2xl flex-1 flex-col items-center gap-4 p-6 text-center">
      <Confetti />
      <p className="text-5xl">🌈 꿈 완성!</p>
      <Character character={student.character} job={student.job} items={student.items} className="bob h-96" />
      <div className="flex items-center gap-3 text-3xl">
        <span>
          멋진 {job?.label}{iGa(job?.label ?? '')} 되었어요!
        </span>
        <SpeakButton text={`꿈 완성! 멋진 ${job?.label}${iGa(job?.label ?? '')} 되었어요`} size="sm" />
      </div>
      <WishBox />
      <button className="btn-primary text-3xl" onClick={onBack}>
        지도로 ▶
      </button>
    </div>
  )
}
