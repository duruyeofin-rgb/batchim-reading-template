import { useCallback, useEffect, useState } from 'react'
import { jobById } from '../data/items'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/util'

interface WishRow {
  id: number
  job: string
  wish: string
  updated_at: string
}

/** 학생이 꿈 완성 화면에서 쓴 「나의 꿈 이야기」 (선생님만 볼 수 있다). 표가 아직 없으면 아무것도 보이지 않는다 */
export default function Wishes({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<WishRow[]>([])
  const [missing, setMissing] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('dream_wishes')
      .select('id, job, wish, updated_at')
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false })
    if (error) {
      const gone = error.code === '42P01' || error.code === 'PGRST205' || (/dream_wishes/.test(error.message) && /exist|schema cache/i.test(error.message))
      setMissing(gone)
      setErr(gone ? '' : error.message)
      return
    }
    setRows((data ?? []) as WishRow[])
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (id: number) => {
    if (!window.confirm('이 글을 지울까요? 학생은 다시 쓸 수 있어요.')) return
    const { error } = await supabase.from('dream_wishes').delete().eq('id', id)
    if (error) setErr(error.message)
    else await load()
  }

  if (missing) return null
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-bold">나의 꿈 이야기 <span className="text-xs font-normal text-slate-500">· 학생이 꿈 완성 화면에서 직접 쓴 글이에요</span></h3>
      {err && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">아직 쓴 글이 없어요. 꿈 세계를 모두 열면 쓸 수 있어요.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 border-t pt-2 text-sm">
              <span className="w-24 shrink-0 font-bold">{jobById(r.job)?.emoji} {jobById(r.job)?.label ?? r.job}</span>
              <span className="flex-1 whitespace-pre-wrap text-base">{r.wish}</span>
              <span className="w-32 shrink-0 text-xs text-slate-500">{fmtDate(r.updated_at)}</span>
              <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => void remove(r.id)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
