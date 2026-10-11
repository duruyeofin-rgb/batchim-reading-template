import Practice from '../learning/Practice'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Unit, activeWords } from '../data/curriculum'
import { SpeakButton, Word } from '../components/common'
import { meaningOf } from '../data/meanings'
import { keyIdxOf } from '../lib/spelling'
import { speak } from '../lib/tts'
import { fetchEarnedItems, saveAttempt, saveProgress } from '../lib/api'
import { type Option, type Question, buildQuestions } from '../lib/quiz'
import Quiz from './Quiz'
import { checkpointEligible } from '../mission/checkpoints'
import { isPassed, unitPassed, useStu } from './ctx'

type Phase = 'intro' | 'learn' | 'word' | 'wordDone' | 'sentence' | 'unitDone' | 'practice'

export default function UnitPlay({
  unit,
  onExit,
  onMission,
}: {
  unit: Unit
  onExit: () => void
  onMission: () => void
}) {
  const stu = useStu()
  const { student, progress } = stu
  const [phase, setPhase] = useState<Phase>('intro')
  const earned = useRef<Set<string>>(new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    fetchEarnedItems(student.id, unit.id)
      .then((s) => alive && (earned.current = s))
      .catch(() => undefined)
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [student.id, unit.id])

  // 문항은 단계가 시작될 때 한 번만 만든다 (보기 순서가 중간에 바뀌지 않게)
  const wordQs = useMemo(() => (phase === 'word' ? buildQuestions(unit, 'word') : []), [phase, unit])
  const sentQs = useMemo(() => (phase === 'sentence' ? buildQuestions(unit, 'sentence') : []), [phase, unit])

  const level = phase === 'word' ? 'word' : 'sentence'
  const alreadyPassed = isPassed(progress, unit.id, level)

  const handleAnswer = (q: Question, opt: Option, firstTry: boolean) => {
    saveAttempt({
      student_id: student.id,
      class_id: student.class_id,
      level: q.level,
      unit_id: unit.id,
      item_id: q.id,
      target: q.level === 'sentence' ? `${q.sentence?.before ?? ''}${q.target}${q.sentence?.after ?? ''}` : q.target,
      answer: opt.label,
      is_correct: opt.correct,
      first_try: firstTry,
      feedback: opt.correct ? null : opt.feedback.replace(/\*\*/g, ''),
    })
    if (opt.correct && firstTry && !alreadyPassed && !earned.current.has(q.id)) {
      earned.current.add(q.id)
      stu.earnDream()
      return true
    }
    return false
  }

  const handleComplete = (lv: 'word' | 'sentence') => (r: { firstTryCorrect: number; total: number }) => {
    if (!isPassed(progress, unit.id, lv)) {
      const row = {
        student_id: student.id,
        unit_id: unit.id,
        level: lv,
        first_try_correct: r.firstTryCorrect,
        total: r.total,
        passed: true,
      } as const
      saveProgress(row)
      stu.setProgressRow(row)
    }
    setPhase(lv === 'word' ? 'wordDone' : 'practice')
  }

  const start = () => {
    if (unitPassed(progress, unit.id)) {
      setPhase('practice')
      return
    }
    const toSentence = isPassed(progress, unit.id, 'word') && !isPassed(progress, unit.id, 'sentence')
    // 겹받침 단원은 문제를 풀기 전에 낱말 카드로 글자·소리·뜻을 먼저 익힌다 (소리가 같은 글자를 구별하려면 글자를 알아야 한다)
    setPhase(toSentence ? 'sentence' : unit.part === 2 ? 'learn' : 'word')
  }

  if (!ready) return <p className="m-auto text-3xl">불러오는 중…</p>

  if (phase === 'intro') {
    const ruleText =
      unit.rule === 'front' ? '앞에 있는 글자로 읽어요' : unit.rule === 'back' ? '뒤에 있는 글자로 읽어요' : null
    return (
      <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-xl text-[#7a6248]">단원 {unit.id}</p>
        <h2 className="text-5xl leading-snug">{unit.title}</h2>
        {unit.part === 1 ? (
          <div className="card flex flex-col items-center gap-3">
            <p className="text-3xl">
              받침 <b className="text-batchim">{unit.jamos}</b>은 모두
            </p>
            <p className="text-6xl text-batchim">[{unit.sound}]</p>
            <p className="text-3xl">소리가 나요.</p>
          </div>
        ) : (
          <div className="card flex flex-col items-center gap-3">
            <p className="text-6xl text-batchim">{unit.jamos}</p>
            <div className="flex items-center gap-4 text-6xl">
              {unit.rule === 'front' ? (
                <>
                  <span className="rounded-2xl bg-orange-200 px-5 py-2">앞</span>
                  <span className="rounded-2xl bg-slate-100 px-5 py-2 opacity-50">뒤</span>
                </>
              ) : (
                <>
                  <span className="rounded-2xl bg-slate-100 px-5 py-2 opacity-50">앞</span>
                  <span className="rounded-2xl bg-orange-200 px-5 py-2">뒤</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 text-4xl">
              <b>{ruleText}</b>
              <SpeakButton text={ruleText ?? ''} />
            </div>
            {unit.id === '2-3' && (
              <p className="rounded-2xl bg-yellow-200 px-4 py-2 text-2xl">★ 밟다는 특별한 낱말이에요!</p>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 text-2xl text-[#7a6248]">
          <span>듣고 고르기 → 받침 채우기 → 새 낱말·문장 읽기로 배워요.</span>
          <SpeakButton text="그림을 보거나 소리를 듣고, 받침이 들어간 낱말을 골라요" size="sm" />
        </div>
        <div className="flex gap-4">
          <button className="btn-soft" onClick={onExit}>
            ◀ 지도로
          </button>
          <button className="btn-primary text-3xl" onClick={start}>
            시작하기 ▶
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'practice') return <Practice unit={unit} onExit={onExit} onDone={() => setPhase('unitDone')} />

  if (phase === 'learn')
    return <LearnCards unit={unit} onBack={() => setPhase('intro')} onStart={() => setPhase('word')} />

  if (phase === 'word')
    return (
      <Quiz
        key="w"
        title="1단계 · 낱말 듣기"
        questions={wordQs}
        onAnswer={handleAnswer}
        onComplete={handleComplete('word')}
      />
    )

  if (phase === 'sentence')
    return (
      <Quiz
        key="s"
        title="1단계 · 문장 듣기"
        questions={sentQs}
        onAnswer={handleAnswer}
        onComplete={handleComplete('sentence')}
      />
    )

  if (phase === 'wordDone')
    return (
      <Done
        emoji="🌟"
        title="낱말 듣기 완료!"
        sub="이제 문장 속 낱말도 듣고 골라요."
        action={{ label: '다음으로 ▶', onClick: () => setPhase('sentence') }}
        onExit={onExit}
      />
    )

  const lastUnit = unit.id === '2-7'
  return (
    <Done
      emoji="🏅"
      title={`단원 ${unit.id} 통과!`}
      sub={
        lastUnit && unitPassed(progress, unit.id)
          ? '모든 받침 여행을 마쳤어요! 읽기 테스트에 도전해 봐요!'
          : '다음 단원이 열렸어요!'
      }
      action={
        checkpointEligible(unit, [...progress.values()])
          ? { label: '중간 평가 미션 ▶', onClick: onMission }
          : { label: '받침 여행 지도 ▶', onClick: onExit }
      }
      onExit={onExit}
    />
  )
}

function Done({
  emoji,
  title,
  sub,
  action,
  onExit,
}: {
  emoji: string
  title: string
  sub: string
  action: { label: string; onClick: () => void }
  onExit: () => void
}) {
  return (
    <div className="relative mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="pop bob text-[120px] leading-none">{emoji}</div>
      <p className="text-5xl">{title}</p>
      <div className="flex items-center gap-3 text-3xl">
        <span>{sub}</span>
        <SpeakButton text={`${title} ${sub}`} size="sm" />
      </div>
      <div className="flex gap-4">
        <button className="btn-soft" onClick={onExit}>
          ◀ 지도로
        </button>
        <button className="btn-primary text-3xl" onClick={action.onClick}>
          {action.label}
        </button>
      </div>
    </div>
  )
}

/** 낱말 익히기: 문제를 풀기 전에 글자·소리·뜻을 카드로 본다 (카드를 누르면 소리가 난다) */
function LearnCards({ unit, onBack, onStart }: { unit: Unit; onBack: () => void; onStart: () => void }) {
  const words = activeWords(unit).map((x) => x.w)
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3 text-3xl">
        <span>📖 낱말을 먼저 익혀요</span>
        <SpeakButton text="낱말을 먼저 익혀요. 카드를 누르면 소리가 나요" size="sm" />
      </div>
      <p className="text-xl text-[#7a6248]">
        카드를 눌러 소리를 들어요. 소리는 같아도 글자는 달라요. 글자를 잘 보아요!
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {words.map((w) => (
          <button
            key={w.text}
            onClick={() => speak(w.pron)}
            className="card flex flex-col items-center gap-1 border-4 border-[#f3dfb5] p-3 text-center active:translate-y-1"
          >
            <Word text={w.text} keyIdx={keyIdxOf(w.text, unit)} className="text-6xl" />
            <span className="text-2xl text-[#7a6248]">소리 [{w.pron}] 🔊</span>
            {meaningOf(w.text) && <span className="text-xl">{meaningOf(w.text)}</span>}
            {w.special && <span className="rounded-full bg-yellow-200 px-3 text-lg">★ 특별한 낱말</span>}
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-4 pb-4">
        <button className="btn-soft" onClick={onBack}>
          ◀ 처음으로
        </button>
        <button className="btn-primary text-3xl" onClick={onStart}>
          문제 풀기 ▶
        </button>
      </div>
    </div>
  )
}
