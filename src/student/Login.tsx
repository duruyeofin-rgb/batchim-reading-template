import { useEffect, useRef, useState } from 'react'
import { SpeakButton } from '../components/common'
import { type Student, ensureAnonymous, getClassSize, joinClass } from '../lib/api'
import { flush } from '../lib/queue'
import { CODE_DIGITS } from '../lib/util'

export default function Login({ onJoined }: { onJoined: (s: Student) => void }) {
  const [code, setCode] = useState('')
  const [size, setSize] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const press = (ch: string) => {
    setMsg('')
    setCode((c) => (c.length < 6 ? c + ch : c))
  }

  const checkCode = async (c: string) => {
    if (c.length !== 6) return
    setBusy(true)
    setMsg('')
    try {
      await ensureAnonymous()
      const n = await getClassSize(c)
      if (!alive.current) return
      if (!n) setMsg('코드가 맞지 않아요. 선생님께 다시 물어봐요.')
      else setSize(n)
    } catch (e) {
      console.error(e)
      const detail = String((e as { message?: string })?.message ?? e).slice(0, 80)
      setMsg(`연결이 안 돼요. 인터넷을 확인하고 선생님께 알려 주세요. (${detail})`)
    } finally {
      setBusy(false)
    }
  }

  const choose = async (n: number) => {
    setBusy(true)
    setMsg('')
    try {
      await flush()
      if (!alive.current) return
      const s = await joinClass(code, n)
      if (!alive.current) return
      try {
        window.history.replaceState(null, '', '/') // 주소창에서 코드를 지운다
      } catch {
        /* ignore */
      }
      onJoined(s)
    } catch {
      setMsg('들어갈 수 없어요. 선생님께 알려 주세요.')
      setBusy(false)
    }
  }

  // 2) 번호 선택
  if (size) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-5 p-4 text-center">
        <div className="flex items-center gap-3 text-4xl">
          <span>내 번호를 눌러요</span>
          <SpeakButton text="내 번호를 눌러요" size="sm" />
        </div>
        <p className="text-xl text-[#7a6248]">학급 코드 <b className="tracking-widest">{code}</b></p>
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
          {Array.from({ length: size }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              disabled={busy}
              onClick={() => choose(n)}
              className="btn-soft h-[72px] min-w-[84px] px-0 text-4xl"
            >
              {n}
            </button>
          ))}
        </div>
        {msg && <p className="text-2xl text-red-600">{msg}</p>}
        <button
          className="btn-soft"
          onClick={() => {
            setSize(null)
            setCode('')
          }}
        >
          ◀ 처음으로
        </button>
      </div>
    )
  }

  // 1) 학급 코드(숫자 6자리) 입력
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="text-4xl">🌈 꿈꾸는 받침 여행</div>
      <div className="flex items-center gap-3 text-3xl">
        <span>선생님이 알려 준 코드를 눌러요</span>
        <SpeakButton text="선생님이 알려 준 여섯 자리 코드를 눌러요" size="sm" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex h-[76px] w-[13vw] max-w-[64px] items-center justify-center rounded-2xl border-4 border-[#f3dfb5] bg-white text-5xl text-batchim"
          >
            {code[i] ?? ''}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-3">
        {CODE_DIGITS.split('').map((ch) => (
          <button key={ch} onClick={() => press(ch)} className="btn-soft h-[76px] min-w-[76px] px-0 text-5xl">
            {ch}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button className="btn-soft" onClick={() => setCode((c) => c.slice(0, -1))}>
          ⌫ 지우기
        </button>
        <button className="btn-primary" disabled={code.length !== 6 || busy} onClick={() => void checkCode(code)}>
          {busy ? '확인 중…' : '입장하기 ▶'}
        </button>
      </div>
      {msg && <p className="text-2xl text-red-600">{msg}</p>}
    </div>
  )
}
