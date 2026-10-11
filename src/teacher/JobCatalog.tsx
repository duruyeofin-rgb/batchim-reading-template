import { useState } from 'react'
import { ELEMS, KIND_LABEL, STEPS, elemsOfJob } from '../data/dreamWorld'
import { JOBS, imgBg, imgFigure, imgTool } from '../data/items'

/** 교사용: 직업별로 학생에게 열리는 꿈 세계(내 모습·일하는 도구·일하는 곳)와 직업 정보 문장을 한눈에 보는 화면 (읽기 전용) */
export default function JobCatalog() {
  const [sel, setSel] = useState(JOBS[0].id)
  const job = JOBS.find((j) => j.id === sel) ?? JOBS[0]
  const elems = elemsOfJob(job.id)

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-bold">직업·꿈 세계 보기</h2>
        <p className="mb-2 text-sm text-slate-500">
          직업 {JOBS.length}개 · 직업마다 {STEPS.length}가지(내 모습 1 · 일하는 도구 3 · 일하는 곳 2)가 정해진 차례로 열려요. 열 때마다 짧은 직업 정보 한 문장이 나와요.
          별은 쓰는 것이 아니라 모으는 것이고, 조건은 아래와 같아요: {STEPS.map(([, stars, reads], i) => `${i + 1}번째 별 ${stars}개${reads ? `+이야기 ${reads}권` : ''}`).join(' · ')}
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
          {JOBS.map((j) => (
            <button
              key={j.id}
              onClick={() => setSel(j.id)}
              className={`flex flex-col items-center rounded-lg border-2 p-1 text-xs ${
                sel === j.id ? 'border-amber-500 bg-amber-50' : 'border-transparent hover:bg-slate-50'
              }`}
            >
              <img src={imgFigure(j.id, 'boy', 0)} alt="" loading="lazy" className="aspect-[3/4] w-full rounded object-cover object-top" />
              <span className="mt-1 leading-tight">{j.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold">
          {job.emoji} {job.label}
        </h3>
        <p className="mb-4 text-sm text-slate-600">{job.desc}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {elems.map((e) => (
            <figure key={e.id} className="rounded-lg border bg-slate-50 p-2 text-center">
              <p className="mb-1 text-xs text-slate-500">
                {e.order + 1}번째 · {KIND_LABEL[e.kind]}
              </p>
              {e.kind === 'me' ? (
                <div className="flex justify-center gap-1">
                  <img src={imgFigure(e.job, 'boy', e.idx)} alt={`${e.name} 남`} loading="lazy" className="h-28 object-contain" />
                  <img src={imgFigure(e.job, 'girl', e.idx)} alt={`${e.name} 여`} loading="lazy" className="h-28 object-contain" />
                </div>
              ) : e.kind === 'tool' ? (
                <img src={imgTool(e.job, e.idx)} alt={e.name} loading="lazy" className="mx-auto h-28 object-contain" />
              ) : (
                <img src={imgBg(e.job, e.idx)} alt={e.name} loading="lazy" className="mx-auto h-28 w-full rounded object-cover" />
              )}
              <figcaption className="mt-1 text-sm font-bold">{e.name}</figcaption>
              <p className="mt-1 text-xs leading-snug text-slate-600">{e.fact}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                ⭐{e.stars}개{e.reads ? ` · 이야기 ${e.reads}권` : ''}
              </p>
            </figure>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">전체 요소 {ELEMS.length}개 · 만들어 둔 그림 중 직업 정보에 알맞은 것만 골라 썼어요.</p>
      </section>
    </div>
  )
}
