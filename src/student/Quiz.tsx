import { useEffect, useRef, useState } from 'react'
import { Confetti, Rich, SpeakButton, Word } from '../components/common'
import { type Option, type Question, QUIZ_PASS_RATE } from '../lib/quiz'
import { speak } from '../lib/tts'

interface Props {
  title: string
  questions: Question[]
  /** 보기를 고를 때마다 호출. 꿈을 받았으면 true 를 돌려준다 */
  onAnswer: (q: Question, opt: Option, firstTry: boolean) => boolean
  onComplete: (r: { firstTryCorrect: number; total: number }) => void
}

/** 낱말 그림. 파일이 없으면 아무것도 그리지 않는다 */
function Pic({ src, className }: { src: string; className: string }) {
  const [ok, setOk] = useState(true)
  useEffect(() => setOk(true), [src])
  if (!ok) return null
  return <img src={src} alt="" className={className} onError={() => setOk(false)} draggable={false} />
}

export default function Quiz({ title, questions, onAnswer, onComplete }: Props) {
  const [round, setRound] = useState(1)
  const [list, setList] = useState(questions)
  const [i, setI] = useState(0)
  const [tried, setTried] = useState<string[]>([])
  const [correct, setCorrect] = useState(false)
  const [earned, setEarned] = useState(false)
  const [fb, setFb] = useState<string | null>(null)
  const [phase, setPhase] = useState<'quiz' | 'retry'>('quiz')
  const firstMap = useRef<Record<string, boolean>>({})
  const firstCount = useRef(0)

  const q = list[i]

  // 소리 듣고 고르기 문제는 문제가 나오면 소리가 자동으로 나온다
  useEffect(() => {
    if (phase !== 'quiz' || !q || q.format !== 'hear') return
    const t = setTimeout(() => speak(q.audio), 350)
    return () => clearTimeout(t)
  }, [q?.id, phase, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetQ = () => {
    setTried([])
    setCorrect(false)
    setEarned(false)
    setFb(null)
  }

  const pick = (opt: Option) => {
    if (correct || tried.includes(opt.label)) return
    const firstTry = round === 1 && tried.length === 0
    const gotDream = onAnswer(q, opt, firstTry)
    if (opt.correct) {
      if (firstTry) firstMap.current[q.id] = true
      setCorrect(true)
      setEarned(gotDream)
      setFb(null)
      speak(q.audio)
    } else {
      setTried([...tried, opt.label])
      setFb(opt.feedback)
      speak(q.correctSpeak) // 틀리면 정답 소리를 들려 준다
    }
  }

  const next = () => {
    if (i + 1 < list.length) {
      setI(i + 1)
      resetQ()
      return
    }
    if (round === 1) {
      const c = questions.filter((x) => firstMap.current[x.id]).length
      firstCount.current = c
      if (c / questions.length >= QUIZ_PASS_RATE) onComplete({ firstTryCorrect: c, total: questions.length })
      else setPhase('retry')
    } else {
      onComplete({ firstTryCorrect: firstCount.current, total: questions.length })
    }
  }

  const startRetry = () => {
    setList(questions.filter((x) => !firstMap.current[x.id]))
    setRound(2)
    setI(0)
    resetQ()
    setPhase('quiz')
  }

  if (phase === 'retry') {
    const wrongN = questions.filter((x) => !firstMap.current[x.id]).length
    return (
      <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="pop text-8xl">🌱</div>
        <p className="text-4xl">틀린 문제만 다시 풀어 볼까요?</p>
        <SpeakButton text="틀린 문제만 다시 풀어 볼까요?" />
        <p className="text-2xl text-[#7a6248]">
          {questions.length}문제 중 {firstCount.current}문제를 처음에 맞혔어요. 괜찮아요, {wrongN}문제만 다시 해요!
        </p>
        <button className="btn-primary text-3xl" onClick={startRetry}>
          다시 풀기
        </button>
      </div>
    )
  }

  if (!q) return null

  const isPicture = q.format === 'picture'
  const sentence = q.sentence

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
      {correct && <Confetti />}

      {/* 진행 */}
      <div className="flex items-center gap-3">
        <span className="text-xl text-[#7a6248]">
          {title} · {round === 2 ? '다시 풀기 ' : ''}
          {i + 1} / {list.length}
        </span>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f3dfb5]">
          <div className="h-full bg-leaf transition-all" style={{ width: `${((i + (correct ? 1 : 0)) / list.length) * 100}%` }} />
        </div>
      </div>

      {/* 문제 */}
      <div className={`card flex flex-col items-center gap-4 py-6 ${q.special ? 'bg-yellow-100 ring-8 ring-yellow-300' : ''}`}>
        {q.special && <p className="text-3xl">★ 특별한 낱말이에요! ★</p>}
        <div className="flex items-center gap-3 text-3xl">
          <span>{q.prompt}</span>
          <SpeakButton text={q.prompt} size="sm" />
        </div>

        {q.meaning && (
          <p className="flex items-center gap-2 rounded-2xl bg-yellow-50 px-4 py-2 text-2xl text-[#7a6248]">
            <span>💡 뜻:</span>
            <span>{q.meaning}</span>
            <SpeakButton text={q.meaning} size="sm" />
          </p>
        )}

        {isPicture ? (
          <div className="flex items-center gap-4">
            {q.pic && <Pic src={q.pic} className="h-56 w-56 rounded-3xl bg-white object-contain" />}
            <SpeakButton text={q.audio} size="lg" label="낱말 듣기" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {sentence && (
              <div className="flex flex-wrap items-center justify-center gap-4">
                {q.pic && <Pic src={q.pic} className="h-28 w-28 rounded-2xl bg-white object-contain" />}
                <p className="text-center text-4xl leading-snug">
                  {sentence.before}
                  {correct ? (
                    <Word text={q.target} keyIdx={q.keyIdx} className="text-red-600" />
                  ) : (
                    <span className="mx-1 inline-block min-w-[3.5em] border-b-4 border-dashed border-batchim align-baseline">
                      &nbsp;
                    </span>
                  )}
                  {sentence.after}
                </p>
              </div>
            )}
            <button className="btn-soft text-3xl" onClick={() => speak(q.audio)} aria-label="다시 듣기">
              🔊 다시 듣기
            </button>
          </div>
        )}
      </div>

      {/* 보기 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {q.options.map((o) => {
          const wasTried = tried.includes(o.label)
          const isRight = correct && o.correct
          return (
            <div key={o.label} className="relative">
              <button
                onClick={() => pick(o)}
                disabled={wasTried || (correct && !o.correct)}
                className={`flex min-h-[110px] w-full items-center justify-center rounded-3xl border-4 px-4 py-5 text-[60px] leading-none shadow-[0_6px_0_rgba(0,0,0,0.12)] transition active:translate-y-1 ${
                  isRight
                    ? 'pop border-leaf bg-green-100'
                    : wasTried
                      ? 'border-orange-200 bg-orange-50 opacity-60'
                      : 'border-[#f3dfb5] bg-white'
                } ${correct && !o.correct ? 'opacity-40' : ''}`}
              >
                <Word text={o.label} keyIdx={q.keyIdx} />
              </button>
              <div className="absolute right-2 top-2">
                <SpeakButton text={o.speak} size="sm" label={`${o.label} 듣기`} />
              </div>
              {wasTried && <span className="absolute left-3 top-2 text-2xl">🌧️</span>}
              {isRight && <span className="absolute left-3 top-2 text-3xl">⭕</span>}
            </div>
          )
        })}
      </div>

      {/* 피드백 */}
      {fb && !correct && (
        <div className="card flex items-center gap-4 border-4 border-orange-200 bg-orange-50 text-2xl leading-relaxed">
          <span className="text-5xl">🤗</span>
          <div className="flex-1">
            <p className="mb-1 text-xl text-[#7a6248]">괜찮아요! 다시 골라 볼까요?</p>
            <Rich text={fb} />
          </div>
          <SpeakButton text={fb} />
        </div>
      )}

      {correct && (
        <div className="card flex flex-wrap items-center justify-between gap-4 border-4 border-green-200 bg-green-50">
          <div className="text-3xl">
            {earned ? (
              <span className="pop inline-block">🎉 잘했어요! ⭐ 꿈 +1</span>
            ) : tried.length > 0 ? (
              <span>👏 끝까지 해냈어요! 대단해요!</span>
            ) : (
              <span>🎉 잘했어요!</span>
            )}
          </div>
          <button className="btn-green text-3xl" onClick={next}>
            {i + 1 < list.length ? '다음 ▶' : '끝! ▶'}
          </button>
        </div>
      )}
    </div>
  )
}
