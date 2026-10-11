import { useEffect, useState } from 'react'
import { learningContext } from '../learning/api'
import { SpeakButton } from '../components/common'
import {
  CC_BY_URL,
  DOORU_APP,
  DOORU_SITE,
  type DooruBook,
  LEVELS,
  bookUrl,
  booksOfLevel,
  readUnitId,
} from '../data/dooru'
import { isPassed, useStu } from './ctx'

/** CC BY 4.0 출처 표시 (저작자·라이선스 링크·변경 표시) */
export function DooruCredit({ book }: { book?: DooruBook }) {
  return (
    <p>
      {book && (
        <>
          「{book.title}」({book.authors}) ·{' '}
        </>
      )}
      <a className="underline" href={DOORU_SITE} target="_blank" rel="noopener noreferrer">
        두루책방
      </a>{' '}
      — © 2019 Enuma, Inc. &amp; The Foundation SeeArt for Book Culture,{' '}
      <a className="underline" href={CC_BY_URL} target="_blank" rel="noopener noreferrer">
        CC BY 4.0
      </a>
      {book ? ` · ${book.pages} 일부 발췌(글만 사용)` : ''}
      {book?.origin && (
        <>
          {' '}
          · 이 책은 {book.origin} 작품을 바탕으로 만들었어요(
          <a className="underline" href={CC_BY_URL} target="_blank" rel="noopener noreferrer">
            CC BY 4.0
          </a>
          ).
        </>
      )}
    </p>
  )
}

export default function ReadTest({
  onOpen,
  onThink,
  onBack,
}: {
  onThink: (book: DooruBook) => void
  onOpen: (book: DooruBook) => void
  onBack: () => void
}) {
  const { student, progress } = useStu()
  const [stories, setStories] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    learningContext(student.id)
      .then((c) => alive && setStories(c.stories))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [student.id])
  const levels = LEVELS.filter((l) => booksOfLevel(l).length > 0)
  const waiting = LEVELS.filter((l) => booksOfLevel(l).length === 0)

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-3 text-3xl">
        <span>📖 읽기 테스트</span>
        <SpeakButton text="읽기 테스트. 책을 읽고, 책의 일부를 소리 내어 읽어요" size="sm" />
      </div>
      <p className="text-2xl text-[#7a6248]">
        ① 두루책방에서 책을 읽어요. ② 일부를 소리 내어 읽어요. ③ 내용을 생각하고 한 문장으로 설명해요.
      </p>

      {levels.map((level) => (
        <section key={level} className="space-y-3">
          <h3 className="text-2xl text-[#7a6248]">{level}단계</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {booksOfLevel(level).map((b) => {
              const done = isPassed(progress, readUnitId(b), 'paragraph')
              return (
                <div
                  key={b.dir}
                  className={`card flex flex-col gap-3 border-4 ${done ? 'border-leaf bg-green-50' : 'border-transparent'}`}
                >
                  <div>
                    <p className="text-3xl">
                      {done ? '✅ ' : ''}
                      {b.title}
                    </p>
                    <p className="text-lg text-[#7a6248]">{b.authors}</p>
                  </div>
                  <a className="btn-soft text-2xl" href={bookUrl(b)} target="_blank" rel="noopener noreferrer">
                    ① 책 읽으러 가기 ↗
                  </a>
                  <button className="btn-primary text-2xl" onClick={() => onOpen(b)}>
                    ② 소리 내어 읽기 🎤
                  </button>
                  <button className="btn-green text-2xl" disabled={!done} onClick={() => onThink(b)}>
                    ③ 이야기 생각하기 {stories.includes(readUnitId(b)) ? '✅' : '💬'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {waiting.length > 0 && (
        <p className="text-xl text-[#7a6248]">{waiting.map((l) => `${l}단계`).join(', ')}는 준비 중이에요.</p>
      )}

      <div className="space-y-2 rounded-2xl bg-white/70 p-3 text-sm leading-relaxed text-[#7a6248]">
        <p>
          책이 잘 안 열리면 선생님께 알려 주세요. (두루책방 앱:{' '}
          <a className="underline" href={DOORU_APP} target="_blank" rel="noopener noreferrer">
            Play 스토어
          </a>
          )
        </p>
        <DooruCredit />
      </div>

      <button className="btn-soft" onClick={onBack}>
        ◀ 지도로
      </button>
    </div>
  )
}
