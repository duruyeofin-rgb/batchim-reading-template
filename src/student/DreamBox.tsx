import { useState } from 'react'
import Character from '../components/Character'
import { SpeakButton } from '../components/common'
import { type Elem, KIND_FOUND, KIND_LABEL, KIND_OPEN, KIND_WAIT, STEP_COUNT } from '../data/dreamWorld'
import { genderOf, imgBg, imgFigure, imgKit, imgTool, jobById } from '../data/items'
import { speak } from '../lib/tts'
import { useStu } from './ctx'

const KINDS = ['me', 'tool', 'place'] as const

/** 요소의 그림 (아직 열리지 않았으면 그림자만 보인다) */
function ElemImg({ e, gender, hidden, big }: { e: Elem; gender: 'boy' | 'girl'; hidden: boolean; big?: boolean }) {
  const src = e.kind === 'me' ? imgFigure(e.job, gender, e.idx) : e.kind === 'tool' ? imgTool(e.job, e.idx) : imgBg(e.job, e.idx)
  return (
    <img
      src={src}
      alt={hidden ? '아직 몰라요' : e.name}
      loading="lazy"
      draggable={false}
      className={`${big ? 'h-64' : 'h-32'} w-full rounded-2xl bg-amber-50 ${e.kind === 'place' ? 'object-cover' : 'object-contain'} ${
        hidden ? 'brightness-0 opacity-20' : ''
      }`}
    />
  )
}

export default function DreamBox({
  onBack,
  onChangeJob,
  onReadTest,
  onComplete,
}: {
  onBack: () => void
  onChangeJob: () => void
  onReadTest: () => void
  onComplete: () => void
}) {
  const { student, world, updateStudent } = useStu()
  const [found, setFound] = useState<Elem | null>(null) // 방금 연 요소
  const job = jobById(student.job)
  const gender = genderOf(student.character)
  const { next, canOpen, needStars, needReads } = world

  const open = () => {
    if (!next || !canOpen) return
    updateStudent({ items: [...student.items, next.id] })
    setFound(next)
    speak(next.fact)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-3 sm:w-72">
        <Character character={student.character} job={student.job} items={student.items} className="h-96" />
        <p className="text-2xl">
          {job?.emoji} 나는 {job?.label}
        </p>
        <div className="flex gap-1" aria-label={`꿈 세계 ${world.openedCount} / ${STEP_COUNT}`}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i} className={`text-2xl ${i < world.openedCount ? '' : 'opacity-25 grayscale'}`}>
              ⭐
            </span>
          ))}
        </div>
        <button className="btn-soft" onClick={onChangeJob}>
          🔄 꿈 바꾸기
        </button>
        <button className="btn-soft" onClick={onBack}>
          ◀ 돌아가기
        </button>
      </div>

      <div className="flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-3xl">
          <span>🎁 꿈 상자</span>
          <SpeakButton text="꿈 상자. 공부해서 모은 별로 내 꿈의 세계를 하나씩 열어요" size="sm" />
          <span className="rounded-full bg-yellow-200 px-4 py-1 text-2xl">⭐ 별 {student.dream_total}개</span>
        </div>

        {/* 지금 할 일 */}
        <div className="card space-y-3 border-4 border-[#f3dfb5]">
          {world.complete ? (
            <>
              <p className="text-3xl">🌈 꿈의 세계를 모두 열었어요!</p>
              <button className="btn-primary text-2xl" onClick={onComplete}>
                나의 꿈 장면 보기 ▶
              </button>
            </>
          ) : canOpen && next ? (
            <>
              <p className="text-2xl text-batchim">✨ {KIND_WAIT[next.kind]}</p>
              <button className="btn-primary wiggle text-3xl" onClick={open}>
                🎁 {KIND_OPEN[next.kind]}
              </button>
            </>
          ) : (
            <>
              <p className="text-2xl">
                {needStars > 0 && (
                  <>
                    받침 공부로 별 <b className="text-batchim">{needStars}개</b>를 더 모으면 다음 요소가 열려요.
                  </>
                )}
                {needStars === 0 && needReads > 0 && (
                  <>
                    이야기를 <b className="text-batchim">{needReads}권</b> 더 읽으면 다음 요소가 열려요.
                  </>
                )}
              </p>
              {needStars === 0 && needReads > 0 && (
                <button className="btn-green text-2xl" onClick={onReadTest}>
                  📖 이야기 읽으러 가기
                </button>
              )}
            </>
          )}
        </div>

        {/* 열린 것들 */}
        {KINDS.map((k) => {
          const list = world.elems.filter((e) => e.kind === k)
          return (
            <section key={k} className="space-y-2">
              <h3 className="text-2xl text-[#7a6248]">{KIND_LABEL[k]}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e) => {
                  const isOpen = world.opened.has(e.id)
                  return (
                    <div key={e.id} className={`card flex flex-col items-center gap-2 border-4 p-3 ${isOpen ? 'border-leaf' : 'border-transparent'}`}>
                      <ElemImg e={e} gender={gender} hidden={!isOpen} />
                      {isOpen ? (
                        <>
                          <p className="text-xl">{e.name}</p>
                          <p className="flex items-start gap-2 text-center text-lg leading-snug text-[#7a6248]">
                            <span>{e.fact}</span>
                            <SpeakButton text={e.fact} size="sm" />
                          </p>
                        </>
                      ) : (
                        <p className="py-2 text-xl text-[#9b8366]">❓ 아직 몰라요</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {found && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="pop card flex max-w-md flex-col items-center gap-3 text-center">
            <p className="text-2xl text-batchim">🌟 {KIND_FOUND[found.kind]}</p>
            {found.kind === 'tool' ? (
              <div className="flex items-end justify-center gap-3">
                <img
                  src={imgKit(found.job, gender, world.elems.filter((x) => x.kind === 'tool' && world.opened.has(x.id)).length)}
                  alt=""
                  className="h-64 object-contain"
                  draggable={false}
                />
                <img src={imgTool(found.job, found.idx)} alt={found.name} className="h-28 object-contain" draggable={false} />
              </div>
            ) : (
              <ElemImg e={found} gender={gender} hidden={false} big />
            )}
            <p className="text-3xl">{found.name}</p>
            <p className="flex items-center gap-2 text-2xl leading-snug">
              <span>{found.fact}</span>
              <SpeakButton text={found.fact} size="sm" />
            </p>
            <button className="btn-primary text-2xl" onClick={() => setFound(null)}>
              알겠어요!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
