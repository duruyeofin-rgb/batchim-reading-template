import { Rich, SpeakButton } from '../components/common'
export default function MissionFeedback({ text, correct }: { text: string; correct: boolean }) {
  if (!text) return null
  return (
    <div className={`mission-feedback ${correct ? 'correct' : ''}`} role="status" aria-live="polite">
      <div>
        <strong>{correct ? '잘했어! 한 걸음 더 갔어.' : '괜찮아. 받침을 보고 다시 골라 보자.'}</strong>
        <p>
          <Rich text={text} />
        </p>
      </div>
      <SpeakButton text={text} label="설명 듣기" />
    </div>
  )
}
