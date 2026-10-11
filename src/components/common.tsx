import { type ReactNode, useState } from 'react'
import { speak } from '../lib/tts'
import { FOOTER_TEXT } from '../lib/util'

export function Footer() {
  return <footer className="px-4 py-3 text-center text-xs text-[#9b8366]">{FOOTER_TEXT}</footer>
}

/** 🔊 듣기 버튼 */
export function SpeakButton({
  text,
  size = 'md',
  onSpeak,
  label = '소리 듣기',
}: {
  text: string
  size?: 'sm' | 'md' | 'lg'
  onSpeak?: () => void
  label?: string
}) {
  const dim = size === 'lg' ? 'h-16 w-16 text-3xl' : size === 'sm' ? 'h-11 w-11 text-xl' : 'h-14 w-14 text-2xl'
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onSpeak?.()
        speak(text)
      }}
      className={`${dim} shrink-0 rounded-full bg-sky/20 text-center shadow active:scale-95`}
    >
      🔊
    </button>
  )
}

/** **굵게** 표시를 주황색 굵은 글씨로 바꿔 보여 준다 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} className="text-batchim">
            {p}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

/** 안내 문구 + 🔊 */
export function Say({ children, text, className = '' }: { children: ReactNode; text: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <span>{children}</span>
      <SpeakButton text={text} size="sm" />
    </div>
  )
}

/** 낱말에서 지정한 음절만 주황색으로 강조 */
export function Word({ text, keyIdx, className = '' }: { text: string; keyIdx: number; className?: string }) {
  return (
    <span className={className}>
      {Array.from(text).map((ch, i) => (
        <span key={i} className={i === keyIdx ? 'text-batchim' : ''}>
          {ch}
        </span>
      ))}
    </span>
  )
}

/** 짧은 축하 애니메이션 */
export function Confetti() {
  const pieces = ['⭐', '🎉', '✨', '🌟', '🎈', '💛']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className="confetti" style={{ left: `${10 + i * 15}%`, animationDelay: `${i * 0.08}s` }}>
          {p}
        </span>
      ))}
    </div>
  )
}

export function useToggle(initial = false) {
  const [v, set] = useState(initial)
  return [v, () => set((x) => !x), set] as const
}

export function SetupNotice() {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-3xl bg-white p-6 text-lg shadow">
      <p className="mb-2 text-2xl">⚙️ 선생님께 알려 주세요</p>
      <p>
        Supabase 연결 값(<code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>)이 아직 설정되지 않았어요.
        README의 설정 순서를 따라 환경 변수를 넣어 주세요.
      </p>
    </div>
  )
}
