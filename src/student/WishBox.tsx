import { useEffect, useState } from 'react'
import { SpeakButton } from '../components/common'
import { jobById } from '../data/items'
import { WISH_MAX, fetchWish, saveWish } from '../lib/api'
import { iGa } from '../lib/hangul'
import { useStu } from './ctx'

/**
 * 꿈 완성 화면 끝: 내가 그 직업으로 무엇을 하고 싶은지 한 문장 쓰기.
 * 글은 선생님만 볼 수 있다. 저장 표가 아직 없으면(교사가 SQL 을 실행하기 전) 이 칸을 보이지 않는다.
 */
export default function WishBox() {
  const { student } = useStu()
  const job = jobById(student.job)
  const stem = job ? `나는 ${job.label}${iGa(job.label)} 되어서 ` : ''
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [text, setText] = useState(stem)
  const [saved, setSaved] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    let alive = true
    if (!student.job) return
    fetchWish(student.id, student.job).then((r) => {
      if (!alive) return
      setMissing(r.missing)
      if (r.wish) {
        setText(r.wish)
        setSaved(r.wish)
        setStatus('saved')
      }
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [student.id, student.job])

  if (!job || !ready || missing) return null

  const changed = text.trim() !== (saved ?? '').trim()
  const hasContent = text.trim().length > stem.trim().length // 시작 문장만 있으면 아직 쓴 것이 아니다

  const save = async () => {
    if (!hasContent || !changed || !student.job) return
    setStatus('saving')
    const r = await saveWish(student.id, student.class_id, student.job, text)
    if (r.missing) {
      setMissing(true)
      return
    }
    if (r.ok) {
      setSaved(text.trim())
      setStatus('saved')
    } else {
      setStatus('error')
    }
  }

  return (
    <div className="card w-full space-y-3 border-4 border-[#f3dfb5] text-left">
      <div className="flex items-center gap-3 text-2xl sm:text-3xl">
        <span>✏️ 나는 {job.label}{iGa(job.label)} 되어서 무엇을 하고 싶나요?</span>
        <SpeakButton text={`나는 ${job.label}${iGa(job.label)} 되어서 무엇을 하고 싶나요? 한 문장으로 써 보아요`} size="sm" />
      </div>
      <textarea
        className="min-h-[110px] w-full resize-none rounded-2xl border-4 border-[#f3dfb5] bg-white p-3 text-2xl leading-snug focus:border-sun focus:outline-none"
        value={text}
        maxLength={WISH_MAX}
        onChange={(e) => {
          setText(e.target.value)
          if (status !== 'saving') setStatus('idle')
        }}
        aria-label="내 꿈 이야기"
        placeholder="여기에 써 보아요"
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary text-2xl" disabled={!hasContent || !changed || status === 'saving'} onClick={() => void save()}>
          {status === 'saving' ? '저장하는 중…' : '저장하기 💾'}
        </button>
        {saved && <SpeakButton text={saved} size="sm" label="내가 쓴 글 듣기" />}
        {status === 'saved' && !changed && <span className="text-xl text-leaf">✅ 저장했어요! 선생님이 읽어 볼 수 있어요.</span>}
        {status === 'error' && <span className="text-xl text-red-600">저장하지 못했어요. 다시 눌러 주세요.</span>}
        <span className="ml-auto text-sm text-[#9b8366]">
          {text.length}/{WISH_MAX}
        </span>
      </div>
      <p className="text-sm text-[#9b8366]">내 이름이나 다른 사람의 이름은 쓰지 않아요. 선생님만 볼 수 있어요.</p>
    </div>
  )
}
