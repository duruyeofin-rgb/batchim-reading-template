import { SpeakButton, Word } from '../components/common'
import { jongOf } from '../lib/hangul'
import type { Option, Question } from '../lib/quiz'
import type { MissionKind, MissionResult } from './missionTypes'

export function questionHint(q: Question) {
  const jong = jongOf(Array.from(q.target)[q.keyIdx] ?? '')
  return `글자는 **${q.target}**, 받침은 **${jong}**이야. 소리는 [${q.pron}]이야.`
}
export default function MissionQuestion({
  q,
  kind,
  result,
  onPick,
  onHint,
  blocked,
}: {
  q: Question
  kind: MissionKind
  result: MissionResult
  onPick: (o: Option) => void
  onHint: () => void
  blocked: boolean
}) {
  const showAnswer = result.hint_used || result.resolved || result.continued
  return (
    <section className="mission-question" aria-label="미션 문제">
      <div className="mission-prompt">
        <h3>
          {q.fill ? '빠진 받침을 채워요' : q.sentence
            ? '빈칸에 들어갈 낱말을 골라요'
            : kind === 'treasure'
              ? '소리와 뜻에 맞는 글자를 골라요'
              : '들은 낱말을 찾아요'}
        </h3>
        <SpeakButton text={q.audio} label="문제 소리 듣기" />
      </div>
      {!showAnswer && <div className="mission-listen-card">
        <SpeakButton text={q.audio} label="다시 듣기" />
        <p>귀 기울여 듣고 골라요</p>
        {q.meaning && <p className="mission-meaning">{q.meaning}</p>}
      </div>}
      {q.fill && !showAnswer && <div className="flex items-center justify-center gap-1 py-5 text-6xl" aria-label="받침이 빠진 낱말">
        <span>{q.fill.before}</span><span className="inline-flex flex-col items-center rounded-xl bg-amber-50 px-2"><span>{q.fill.base}</span><span className="text-3xl text-batchim">□</span></span><span>{q.fill.after}</span>
      </div>}
      {showAnswer &&
      <div className="mission-word-card">
        {q.pic && <img src={q.pic} alt="낱말 그림" />}
        <div>
          <span className="mission-card-label">기억할 글자</span>
          <Word text={q.target} keyIdx={q.keyIdx} className="mission-target" />
          <p>
            받침 <b>{jongOf(Array.from(q.target)[q.keyIdx])}</b> · 소리 [{q.pron}]
          </p>
        </div>
        {q.meaning && <p className="mission-meaning">{q.meaning}</p>}
      </div>}
      {q.sentence && (
        <p className="mission-sentence">
          {q.sentence.before}
          <span className="mission-blank">{result.resolved ? q.target : '▢'}</span>
          {q.sentence.after}
        </p>
      )}
      {showAnswer && q.special && <p className="mission-special">밟다는 특별해요. 뒤의 ㅂ으로 읽어요.</p>}
      <div className="mission-options">
        {q.options.map((o) => (
          <button
            key={o.label}
            className={result.resolved && o.correct ? 'is-correct' : ''}
            disabled={blocked}
            onClick={() => onPick(o)}
            aria-label={`${o.label} 선택`}
          >
            <Word text={o.label} keyIdx={q.keyIdx} />
            {result.resolved && o.correct && <small>정답</small>}
          </button>
        ))}
      </div>
      <button className="mission-hint" onClick={onHint} disabled={blocked}>
        받침 힌트 보기
      </button>
    </section>
  )
}
