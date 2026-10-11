import { useState } from 'react'
import { SpeakButton } from '../components/common'
import { GENDERS, JOBS, genderOf, imgBase, imgFigure, jobById } from '../data/items'

export function CharacterPicker({ onPick }: { onPick: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 p-4">
      <div className="flex items-center gap-3 text-4xl">
        <span>함께 여행할 친구를 골라요</span>
        <SpeakButton text="함께 여행할 친구를 골라요" size="sm" />
      </div>
      <div className="grid w-full grid-cols-2 gap-6">
        {GENDERS.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c.id)}
            className={`card flex flex-col items-center gap-2 border-4 p-3 transition ${
              sel === c.id ? 'wiggle scale-105 border-batchim' : 'border-transparent'
            }`}
          >
            <img src={imgBase(c.id)} alt={c.name} className="h-72 object-contain" draggable={false} />
            <span className="text-3xl">{c.name}</span>
          </button>
        ))}
      </div>
      <button className="btn-primary text-3xl" disabled={!sel} onClick={() => sel && onPick(sel)}>
        이 친구로 할래요 ▶
      </button>
    </div>
  )
}

export function JobPicker({
  character,
  onPick,
  current,
  onCancel,
}: {
  character: string | null
  onPick: (id: string) => void
  /** 직업을 바꿀 때: 지금 직업 */
  current?: string | null
  onCancel?: () => void
}) {
  const [sel, setSel] = useState<string | null>(null)
  const g = genderOf(character)
  const job = jobById(sel)
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-3 p-4">
      <div className="flex items-center gap-3 text-4xl">
        <span>{current ? '새로운 꿈 직업을 골라요' : '나의 꿈 직업을 골라요'}</span>
        <SpeakButton text={current ? '새로운 꿈 직업을 골라요' : '나의 꿈 직업을 골라요'} size="sm" />
        {onCancel && (
          <button className="btn-soft ml-4 min-h-[48px] px-4 text-xl" onClick={onCancel}>
            ◀ 그대로 둘래요
          </button>
        )}
      </div>

      <div className="card flex w-full items-center gap-4 border-4 border-[#f3dfb5] p-3 sm:p-4">
        {job ? (
          <>
            <img src={imgFigure(job.id, g)} alt={job.label} className="h-40 shrink-0 object-contain sm:h-52" draggable={false} />
            <div className="flex-1 space-y-2">
              <p className="flex items-center gap-2 text-3xl sm:text-4xl">
                <span>{job.label}</span>
                <SpeakButton text={`${job.label}. ${job.desc}`} size="sm" />
              </p>
              <p className="text-xl text-[#7a6248] sm:text-2xl">{job.desc}</p>
            </div>
            <button className="btn-primary shrink-0 text-2xl sm:text-3xl" disabled={job.id === current} onClick={() => onPick(job.id)}>
              {current && job.id === current ? '지금 꿈이에요' : '이 꿈으로 할래요 ▶'}
            </button>
          </>
        ) : (
          <p className="w-full py-8 text-center text-2xl text-[#7a6248]">아래에서 되고 싶은 직업을 눌러 보아요!</p>
        )}
      </div>

      <div className="grid w-full grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
        {JOBS.map((j) => (
          <button
            key={j.id}
            onClick={() => setSel(j.id)}
            className={`card flex flex-col items-center gap-1 border-4 p-2 transition ${
              sel === j.id ? 'wiggle scale-105 border-batchim' : 'border-transparent'
            }`}
          >
            <img
              src={imgFigure(j.id, g)}
              alt=""
              loading="lazy"
              className="aspect-[3/4] w-full rounded-2xl object-cover object-top"
              draggable={false}
            />
            <span className="text-xl leading-tight sm:text-2xl">{j.label}</span>
          </button>
        ))}
      </div>

      {onCancel && (
        <button className="btn-soft" onClick={onCancel}>
          ◀ 그대로 둘래요
        </button>
      )}
    </div>
  )
}
