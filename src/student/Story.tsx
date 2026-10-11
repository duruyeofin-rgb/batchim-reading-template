import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type Story, storyItemId } from '../data/curriculum'
import { Confetti, Rich, SpeakButton } from '../components/common'
import { fetchEarnedItems, fetchTeacherDecision, latestTeacherDecisionId, saveAttempt, saveProgress } from '../lib/api'
import { eulReul, iRago } from '../lib/hangul'
import { TAG_HELP } from '../lib/helpTags'
import { type WordFeedback, fixNumbers, judgeReading, judgeWord, markWords, wordFeedbacks } from '../lib/similarity'
import { speak } from '../lib/tts'
import { isPassed, useStu } from './ctx'

type Status = 'ready' | 'listening' | 'pass' | 'retry' | 'waiting' | 'skipped'

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: any) => void) | null // eslint-disable-line @typescript-eslint/no-explicit-any
  onerror: ((e: any) => void) | null // eslint-disable-line @typescript-eslint/no-explicit-any
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

const getSR = (): (new () => SpeechRecognitionLike) | null => {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null
}

export function StoryReader({
  story,
  onExit,
  onNext,
  label,
  backLabel = '◀ 이야기 목록',
  nextLabel = '다음 이야기 ▶',
  credit,
  practiceMode = false,
  onReadingComplete,
  initialReadRows = [],
  onReadingProgress,
}: {
  story: Pick<Story, 'id' | 'title' | 'sentences'> & { n?: number }
  onExit: () => void
  onNext: (() => void) | null
  /** 화면 위쪽 이름 (기본: 이야기 N. 제목) */
  label?: string
  backLabel?: string
  nextLabel?: string
  /** 출처 표시 (두루책방 책을 읽을 때) */
  initialReadRows?: { passed: boolean; firstTry: boolean }[]
  onReadingProgress?: (rows: { passed: boolean; firstTry: boolean }[]) => void
  practiceMode?: boolean
  onReadingComplete?: (rows: { passed: boolean; firstTry: boolean }[]) => void
  credit?: ReactNode
}) {
  const heading = label ?? `이야기 ${story.n ?? ''}. ${story.title}`
  const stu = useStu()
  const { student, progress } = stu
  const alreadyPassed = isPassed(progress, story.id, 'paragraph')

  const [idx, setIdx] = useState(Math.min(initialReadRows.length, story.sentences.length - 1))
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<Status>('ready')
  const [heard, setHeard] = useState('')
  const [msg, setMsg] = useState('')
  const [micError, setMicError] = useState<'denied' | 'unsupported' | null>(getSR() ? null : 'unsupported')
  const [finished, setFinished] = useState<null | { passed: boolean; ok: number }>(null)
  const [fbs, setFbs] = useState<WordFeedback[]>([])
  const [practiceDone, setPracticeDone] = useState<Record<string, boolean>>({})
  const [practicing, setPracticing] = useState<string | null>(null)
  const [practiceMsg, setPracticeMsg] = useState('')

  const [teacherOk, setTeacherOk] = useState(false) // 선생님이 통과로 확인해 준 문장인지
  const decisionBase = useRef<number | null>(null) // 기다리기 시작할 때의 선생님 결정 번호
  const baseAsked = useRef(false)
  const attemptRef = useRef(0)
  const listened = useRef(false)
  const results = useRef<{ passed: boolean; firstTry: boolean }[]>([...initialReadRows])
  const earned = useRef<Set<string>>(new Set())
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    fetchEarnedItems(student.id, story.id)
      .then((s) => (earned.current = s))
      .catch(() => undefined)
    return () => {
      try {
        recRef.current?.stop()
      } catch {
        /* ignore */
      }
    }
  }, [student.id, story.id])

  const sentence = story.sentences[idx]
  const total = story.sentences.length

  // 선생님 확인을 기다리기 시작하면 화면 맨 위로 올리고 소리로도 알려 준다
  useEffect(() => {
    if (status !== 'waiting') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
    speak('선생님을 불러요. 손을 들어요. 선생님이 확인하면 넘어가요.')
  }, [status === 'waiting', idx]) // eslint-disable-line react-hooks/exhaustive-deps

  // 선생님 확인을 기다리는 동안 몇 초마다 선생님이 결정했는지 살펴본다
  useEffect(() => {
    if (status !== 'waiting') return
    const itemId = storyItemId(story, idx)
    let alive = true
    const tick = async () => {
      if (decisionBase.current === null) return
      const d = await fetchTeacherDecision(student.id, itemId, decisionBase.current)
      if (!alive || !d) return
      if (d === 'pass') {
        results.current[idx] = { passed: true, firstTry: false }
        setTeacherOk(true)
        setFbs([])
        setStatus('pass')
      } else {
        results.current[idx] = { passed: false, firstTry: false }
        setStatus('skipped')
      }
    }
    const t = setInterval(() => void tick(), 3000)
    void tick()
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [status, idx]) // eslint-disable-line react-hooks/exhaustive-deps

  const evaluate = (text: string) => {
    // 틀린 어절이 하나도 없어야 통과 (유사도 % 만으로는 한 낱말을 틀려도 통과해 버린다)
    const j = judgeReading(sentence, text)
    const sim = j.similarity
    const pass = j.pass
    const n = attemptRef.current + 1
    attemptRef.current = n
    setAttempt(n)
    const itemId = storyItemId(story, idx)
    saveAttempt({
      student_id: student.id,
      class_id: student.class_id,
      level: 'paragraph',
      unit_id: story.id,
      item_id: itemId,
      target: sentence,
      answer: text,
      is_correct: pass,
      first_try: n === 1,
      similarity: Math.round(sim * 1000) / 1000,
      listened_first: listened.current,
      feedback: !pass && n >= 3 ? TAG_HELP : null,
    })
    listened.current = false // 다음 시도는 다시 '스스로 읽기'부터
    if (pass) {
      results.current[idx] = { passed: true, firstTry: n === 1 }
      if (!practiceMode && n === 1 && !alreadyPassed && !earned.current.has(itemId)) {
        earned.current.add(itemId)
        stu.earnDream()
      }
      setFbs([])
      setTeacherOk(false)
      setStatus('pass')
      speak('잘 읽었어요')
    } else {
      // 어느 낱말을 어떻게 읽었는지, 받침이 원인이면 받침 힌트까지 알려 준다
      setFbs(wordFeedbacks(sentence, text))
      setPracticeDone({})
      setPracticeMsg('')
      if (n >= 3) {
        // 3번 읽어도 통과하지 못하면 학생이 넘어갈 수 없다. 선생님이 교사 화면에서 확인할 때까지 기다린다.
        if (!baseAsked.current) {
          baseAsked.current = true
          void latestTeacherDecisionId(student.id, itemId).then((id) => {
            decisionBase.current = id
          })
        }
        setStatus('waiting')
      } else {
        setStatus('retry')
      }
    }
  }

  /** 마이크로 듣고, 인식된 글자(가장 가능성이 높은 결과)를 돌려준다 */
  const listen = (_target: string, onText: (heard: string) => void, onStart: () => void, onIdle: () => void) => {
    const SR = getSR()
    if (!SR) {
      setMicError('unsupported')
      return
    }
    setMsg('')
    const r = new SR()
    r.lang = 'ko-KR'
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1 // 가장 가능성이 높은 인식 결과만 쓴다 (후보 중 정답에 가까운 것을 고르면 잘못 읽어도 통과해 버린다)
    let finalText = ''
    let err = ''
    r.onresult = (e) => {
      let t = ''
      for (let k = 0; k < e.results.length; k++) t += e.results[k][0].transcript
      finalText = t
      setHeard(t)
    }
    r.onerror = (e) => {
      err = e.error ?? ''
    }
    r.onend = () => {
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMicError('denied')
        onIdle()
      } else if (!finalText.trim()) {
        onIdle()
        setMsg(err === 'network' ? '인터넷이 불안해요. 다시 눌러 볼까요?' : '소리가 잘 안 들렸어요. 다시 눌러 볼까요?')
      } else {
        onText(finalText)
      }
    }
    recRef.current = r
    onStart()
    try {
      r.start()
    } catch {
      onIdle()
    }
  }

  /** 문장 전체 읽기 */
  const startListening = () => {
    setHeard('')
    listen(
      sentence,
      (best) => {
        // 인식기가 숫자로 적은 수(5, 10)는 원래 문장의 우리말 수(다섯, 열)로 바꿔서 비교한다
        const fixed = fixNumbers(sentence, best)
        setHeard(fixed)
        evaluate(fixed)
      },
      () => setStatus('listening'),
      () => setStatus(attemptRef.current >= 3 ? 'waiting' : attemptRef.current > 0 ? 'retry' : 'ready'),
    )
  }

  /** 틀린 낱말 하나만 따로 읽어 보기 (기록·꿈과 상관없는 연습) */
  const practiceWord = (word: string) => {
    const clean = word.replace(/[^\p{L}\p{N}]/gu, '')
    setPracticing(word)
    listen(
      clean,
      (heardRaw) => {
        const best = fixNumbers(clean, heardRaw)
        setPracticing(null)
        if (judgeWord(clean, best)) {
          setPracticeDone((d) => ({ ...d, [word]: true }))
          setPracticeMsg(`👏 '${clean}' 잘 읽었어요! 이제 문장 전체를 다시 읽어 봐요.`)
          speak('잘 읽었어요')
        } else {
          setPracticeMsg(`'${best}'${iRago(best)} 들렸어요. '${clean}'${eulReul(clean)} 천천히 다시 읽어 봐요.`)
        }
      },
      () => setPracticeMsg(''),
      () => setPracticing(null),
    )
  }

  const stopListening = () => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
  }

  const goNext = () => {
    onReadingProgress?.(results.current.slice(0, idx + 1))
    if (idx + 1 < total) {
      setIdx(idx + 1)
      attemptRef.current = 0
      setAttempt(0)
      listened.current = false
      decisionBase.current = null
      baseAsked.current = false
      setTeacherOk(false)
      setStatus('ready')
      setHeard('')
      setMsg('')
      setFbs([])
      setPracticeDone({})
      setPracticeMsg('')
      return
    }
    // 문단 끝: 문장의 80% 이상 통과해야 문단 통과
    const ok = results.current.filter((r) => r?.passed).length
    const firstOk = results.current.filter((r) => r?.firstTry).length
    const passed = ok / total >= 0.8
    if (!practiceMode && !alreadyPassed) {
      const row = {
        student_id: student.id,
        unit_id: story.id,
        level: 'paragraph',
        first_try_correct: firstOk,
        total,
        passed,
      } as const
      saveProgress(row)
      stu.setProgressRow(row)
    }
    if (onReadingComplete) {
      onReadingComplete(results.current)
      return
    }
    setFinished({ passed, ok })
  }

  const retryStory = () => {
    results.current = []
    setIdx(0)
    attemptRef.current = 0
    setAttempt(0)
    listened.current = false
    decisionBase.current = null
    baseAsked.current = false
    setTeacherOk(false)
    setStatus('ready')
    setHeard('')
    setFbs([])
    setPracticeDone({})
    setPracticeMsg('')
    setFinished(null)
  }

  if (micError) {
    return (
      <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <svg viewBox="0 0 160 160" className="h-40 w-40">
          <circle cx="80" cy="80" r="70" fill="#FFE8B0" />
          <rect x="62" y="36" width="36" height="62" rx="18" fill="#7a6248" />
          <path
            d="M44 84 Q44 118 80 118 Q116 118 116 84"
            stroke="#7a6248"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <line x1="80" y1="118" x2="80" y2="136" stroke="#7a6248" strokeWidth="7" strokeLinecap="round" />
          <line x1="36" y1="36" x2="124" y2="124" stroke="#E63946" strokeWidth="10" strokeLinecap="round" />
        </svg>
        <div className="flex items-center gap-3 text-4xl">
          <span>선생님께 알려 주세요</span>
          <SpeakButton text="선생님께 알려 주세요" size="sm" />
        </div>
        <p className="text-2xl text-[#7a6248]">
          {micError === 'denied'
            ? '마이크를 쓸 수 있게 허락이 필요해요.'
            : '이 기기에서는 말을 알아듣는 기능을 쓸 수 없어요.'}
        </p>
        <button className="btn-soft" onClick={onExit}>
          ◀ 돌아가기
        </button>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="relative mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        {finished.passed && <Confetti />}
        <div className="pop bob text-[110px] leading-none">{finished.passed ? '📖' : '🌱'}</div>
        <p className="text-5xl">
          {finished.passed ? `${label ?? `이야기 ${story.n}`} 통과!` : '한 번 더 읽어 볼까요?'}
        </p>
        <p className="text-3xl text-[#7a6248]">
          {total}문장 중 {finished.ok}문장을 읽었어요.
        </p>
        <div className="flex gap-4">
          <button className="btn-soft" onClick={onExit}>
            {backLabel}
          </button>
          {finished.passed ? (
            onNext && (
              <button className="btn-primary text-3xl" onClick={onNext}>
                {nextLabel}
              </button>
            )
          ) : (
            <button className="btn-primary text-3xl" onClick={retryStory}>
              다시 읽기
            </button>
          )}
        </div>
        {credit && <div className="text-sm leading-relaxed text-[#7a6248]">{credit}</div>}
      </div>
    )
  }

  const marks = status === 'retry' || status === 'waiting' ? markWords(sentence, heard) : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <span className="text-xl text-[#7a6248]">
          {heading} · {idx + 1} / {total}
        </span>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f3dfb5]">
          <div className="h-full bg-leaf transition-all" style={{ width: `${(idx / total) * 100}%` }} />
        </div>
      </div>

      {/* 3번 읽어도 통과하지 못하면 선생님이 확인할 때까지 기다린다. 학생이 직접 넘어가는 버튼은 없다.
          화면 맨 위에 크게 보여서 놓치지 않게 한다 */}
      {status === 'waiting' && (
        <div className="pop flex flex-wrap items-center gap-4 rounded-3xl border-8 border-amber-400 bg-amber-100 p-5 text-4xl shadow-lg">
          <span className="bob text-7xl">🙋</span>
          <div className="flex-1">
            <p className="flex items-center gap-3">
              선생님을 불러요!
              <SpeakButton text="선생님을 불러요. 선생님이 확인하면 넘어가요" size="sm" />
            </p>
            <p className="text-2xl text-[#7a6248]">
              손을 들어요. 선생님이 확인하면 넘어가요. 그동안 다시 읽어 봐도 좋아요.
            </p>
          </div>
        </div>
      )}

      {/* 문단 전체: 지금 읽을 문장만 크게 */}
      <div className="card text-3xl leading-[1.9]">
        {story.sentences.map((s, i) => (
          <span
            key={i}
            className={
              i === idx
                ? 'rounded-xl bg-yellow-100 px-2 text-[44px] text-[#3d2c1e]'
                : i < idx
                  ? 'px-1 text-[#6b8e5a] opacity-70'
                  : 'px-1 opacity-30'
            }
          >
            {i === idx && marks
              ? marks.map((m, k) => (
                  <span key={k} className={m.bad ? 'text-red-600 underline decoration-4 underline-offset-8' : ''}>
                    {m.word}{' '}
                  </span>
                ))
              : s}{' '}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        {(status === 'ready' || status === 'retry' || status === 'waiting') && (
          <button className="btn-primary text-3xl" disabled={practicing !== null} onClick={startListening}>
            🎤 {status === 'ready' ? '내가 읽어 볼래요' : '문장 다시 읽기'}
          </button>
        )}
        {status === 'listening' && (
          <button className="btn-green wiggle text-3xl" onClick={stopListening}>
            👂 듣고 있어요… (다 읽으면 눌러요)
          </button>
        )}
        {/* 스스로 읽는 것이 먼저! 틀린 뒤에만 본보기 소리를 들려 준다 */}
        {(status === 'retry' || status === 'waiting') && (
          <button
            className="btn-soft text-3xl"
            onClick={() => {
              listened.current = true
              speak(sentence)
            }}
          >
            🔊 이렇게 읽어요
          </button>
        )}
      </div>

      {/* 인식 결과 */}
      <div className="card min-h-[88px] text-center text-3xl">
        {heard ? <span>🗣️ {heard}</span> : <span className="text-[#b9a587]">읽으면 여기에 글자가 나타나요</span>}
        {msg && <p className="mt-2 text-2xl text-orange-600">{msg}</p>}
      </div>

      {(status === 'retry' || status === 'waiting') && fbs.length > 0 && (
        <div className="card space-y-3 border-4 border-orange-200 bg-orange-50 text-2xl">
          <div className="flex items-center gap-3">
            <span className="text-5xl">🤗</span>
            <div className="flex-1">
              <p>빨간 낱말을 먼저 읽어 보고, 문장을 다시 읽어 봐요.</p>
              <p className="text-lg text-[#7a6248]">{attempt} / 3번 해 봤어요</p>
            </div>
          </div>
          {fbs.slice(0, 3).map((f) => (
            <div key={f.word} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3">
              <span className={`text-4xl ${practiceDone[f.word] ? 'text-green-600' : 'text-red-600'}`}>
                {practiceDone[f.word] ? '✅ ' : ''}
                {f.word}
              </span>
              <SpeakButton text={f.word} size="sm" label={`${f.word} 듣기`} />
              <p className="min-w-[200px] flex-1 text-xl leading-snug">
                <Rich text={f.hint} />
              </p>
              {(status === 'retry' || status === 'waiting') && (
                <button
                  className="btn-soft min-h-[56px] px-4 text-xl"
                  disabled={practicing !== null}
                  onClick={() => practiceWord(f.word)}
                >
                  {practicing === f.word ? '👂 듣고 있어요…' : '🎤 이 낱말 읽기'}
                </button>
              )}
            </div>
          ))}
          {practiceMsg && <p className="text-xl text-[#7a6248]">{practiceMsg}</p>}
        </div>
      )}

      {status === 'pass' && (
        <div className="card flex items-center justify-between gap-4 border-4 border-green-200 bg-green-50 text-3xl">
          <span>
            {teacherOk
              ? '👩‍🏫 선생님이 확인했어요!'
              : `🎉 잘 읽었어요!${!practiceMode && attempt === 1 && !alreadyPassed ? ' ⭐ 꿈 +1' : ''}`}
          </span>
          <button className="btn-green text-3xl" onClick={goNext}>
            {idx + 1 < total ? '다음 문장 ▶' : '끝! ▶'}
          </button>
        </div>
      )}

      {status === 'skipped' && (
        <div className="card flex items-center justify-between gap-4 border-4 border-orange-200 bg-orange-50 text-3xl">
          <span className="flex items-center gap-3">
            👩‍🏫 선생님과 함께 읽었어요. 다음 문장으로 가요!
            <SpeakButton text="선생님과 함께 읽었어요. 다음 문장으로 가요" size="sm" />
          </span>
          <button className="btn-green text-3xl" onClick={goNext}>
            {idx + 1 < total ? '다음 문장 ▶' : '끝! ▶'}
          </button>
        </div>
      )}

      {credit && <div className="mt-2 text-center text-sm leading-relaxed text-[#7a6248]">{credit}</div>}
    </div>
  )
}
