import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Footer, SetupNotice } from '../components/common'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { ID_RULE, REQUIRE_INVITE, displayName, idToEmail, normalizeId, validId } from '../lib/teacherId'
import { randomCode } from '../lib/util'
import ClassView from './ClassView'
import JobCatalog from './JobCatalog'
import type { ClassRow } from './data'

export default function TeacherApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [view, setView] = useState<'classes' | 'catalog'>('classes')

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // 익명 사용자(학생 태블릿)는 교사 화면을 쓸 수 없다
  const teacher = session && !session.user.is_anonymous ? session : null

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-['Noto_Sans_KR',sans-serif] text-slate-800">
      <header className="flex items-center gap-3 bg-amber-300 px-5 py-3">
        <h1 className="text-xl font-bold">🌈 꿈꾸는 받침 여행 · 교사용</h1>
        {teacher && (
          <>
            <span className="ml-auto text-sm">{displayName(teacher.user.email)}</span>
            <button className="tbtn" onClick={() => void supabase.auth.signOut()}>로그아웃</button>
          </>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-5">
        {!supabaseConfigured ? (
          <SetupNotice />
        ) : session === undefined ? (
          <p>불러오는 중…</p>
        ) : !teacher ? (
          <AuthForm />
        ) : (
          <>
            <nav className="mb-4 flex gap-2">
              <button className={`rounded-lg px-4 py-2 font-bold ${view === 'classes' ? 'bg-amber-400' : 'bg-white shadow-sm'}`} onClick={() => setView('classes')}>
                내 학급
              </button>
              <button className={`rounded-lg px-4 py-2 font-bold ${view === 'catalog' ? 'bg-amber-400' : 'bg-white shadow-sm'}`} onClick={() => setView('catalog')}>
                직업·꿈 세계 보기
              </button>
            </nav>
            <div className={view === 'classes' ? '' : 'hidden'}>
              <Classes />
            </div>
            {view === 'catalog' && <JobCatalog />}
          </>
        )}
        <p className="mt-10 rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-500">
          Supabase 무료 플랜은 7일간 사용이 없으면 일시정지됩니다. 방학 뒤에는 Supabase 대시보드에서 Restore project를 눌러 주세요.
          데이터는 지워지지 않습니다.
        </p>
      </main>
      <Footer />
    </div>
  )
}

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [invite, setInvite] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // 예전에 이메일로 가입한 계정은 '@'가 들어 있으면 그대로 이메일로 로그인한다
  const loginEmail = () => (id.includes('@') ? id.trim() : idToEmail(id))

  const login = async () => {
    setBusy(true)
    setMsg('')
    if (!id.includes('@') && !validId(normalizeId(id))) {
      setMsg(`아이디는 ${ID_RULE}`)
      setBusy(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(), password: pw })
    if (error) setMsg('아이디나 비밀번호가 맞지 않아요.')
    setBusy(false)
  }

  const signup = async () => {
    setBusy(true)
    setMsg('')
    try {
      const uid = normalizeId(id)
      if (!validId(uid)) return setMsg(`아이디는 ${ID_RULE}`)
      if (pw.length < 6) return setMsg('비밀번호는 6자 이상으로 해 주세요.')
      if (REQUIRE_INVITE) {
        if (!invite.trim()) return setMsg('교사 초대 암호를 입력해 주세요. (제작 선생님께 받아요)')
        // 초대 암호가 맞는지 먼저 확인한다 (틀린 암호로 아이디만 쓰이는 일이 없게)
        const ok = await supabase.rpc('check_teacher_invite', { p_code: invite })
        if (ok.error || ok.data !== true) return setMsg('교사 초대 암호가 맞지 않아요.')
      }
      const { data, error } = await supabase.auth.signUp({ email: idToEmail(uid), password: pw })
      const taken = (error as { code?: string } | null)?.code === 'user_already_exists' || /already|registered|exists/i.test(error?.message ?? '')
      // 같은 아이디가 이미 있으면 새로 만들지 않고 다른 아이디를 쓰라고 알려 준다
      if (taken || (!error && data.user && (data.user.identities?.length ?? 1) === 0)) {
        return setMsg(`이미 쓰고 있는 아이디(별명)예요: '${uid}'. 다른 아이디를 써 주세요.`)
      }
      if (error) return setMsg('가입할 수 없어요: ' + error.message)
      if (!data.session) return setMsg('가입은 됐지만 바로 로그인되지 않았어요. 로그인 탭에서 로그인해 주세요.')
      if (REQUIRE_INVITE) {
        const red = await supabase.rpc('redeem_teacher_invite', { p_code: invite })
        if (red.error || red.data !== true) {
          await supabase.auth.signOut()
          return setMsg('교사 승인에 실패했어요. 초대 암호를 다시 확인해 주세요.')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="mx-auto mt-10 flex max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 shadow"
      onSubmit={(e) => {
        e.preventDefault()
        void (mode === 'login' ? login() : signup())
      }}
    >
      <div className="flex gap-2">
        <button type="button" className={`flex-1 rounded-lg p-2 font-bold ${mode === 'login' ? 'bg-amber-400' : 'bg-slate-100'}`} onClick={() => { setMode('login'); setMsg('') }}>
          로그인
        </button>
        <button type="button" className={`flex-1 rounded-lg p-2 font-bold ${mode === 'signup' ? 'bg-amber-400' : 'bg-slate-100'}`} onClick={() => { setMode('signup'); setMsg('') }}>
          처음이에요
        </button>
      </div>
      <input className="rounded-lg border p-3" placeholder="아이디" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoCapitalize="none" required />
      <input className="rounded-lg border p-3" type="password" placeholder="비밀번호 (6자 이상)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
      {mode === 'signup' && (
        <>
          {REQUIRE_INVITE && (
            <input className="rounded-lg border p-3" placeholder="교사 초대 암호" value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" required />
          )}
          <p className="text-xs leading-relaxed text-slate-500">
            아이디(별명): {ID_RULE}. <b>이메일은 받지 않아요.</b> 이미 쓰고 있는 아이디면 다른 아이디를 써야 해요.
            비밀번호를 잊으면 스스로 찾을 수 없으니, 제작 선생님께 재설정을 요청해야 해요.
          </p>
        </>
      )}
      <button className="rounded-lg bg-amber-400 p-3 font-bold" disabled={busy}>
        {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
      </button>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </form>
  )
}

function Classes() {
  const [list, setList] = useState<ClassRow[] | null>(null)
  const [open, setOpen] = useState<ClassRow | null>(null)
  const [name, setName] = useState('')
  const [count, setCount] = useState(25)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('classes').select('*').order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setList(data as ClassRow[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    const n = Math.min(30, Math.max(1, Math.floor(count) || 1))
    if (!name.trim()) {
      setErr('학급 이름을 써 주세요.')
      return
    }
    setBusy(true)
    setErr('')
    // 무작위 6자리 코드. 겹치면(고유 제약 위반) 다시 뽑는다.
    for (let i = 0; i < 8; i++) {
      const { error } = await supabase.from('classes').insert({ name: name.trim(), code: randomCode(6), student_count: n })
      if (!error) {
        setName('')
        await load()
        setBusy(false)
        return
      }
      if (error.code !== '23505') {
        setErr(error.message)
        setBusy(false)
        return
      }
    }
    setErr('코드를 만들지 못했어요. 다시 눌러 주세요.')
    setBusy(false)
  }

  if (open)
    return (
      <ClassView
        cls={open}
        onBack={() => setOpen(null)}
        onDeleted={() => {
          setOpen(null)
          void load()
        }}
      />
    )

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">학급 만들기</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            학급 이름
            <input className="mt-1 block rounded-lg border p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 2학년 3반" />
          </label>
          <label className="text-sm">
            학생 수 (1~30)
            <input className="mt-1 block w-24 rounded-lg border p-2" type="number" min={1} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <button className="rounded-lg bg-amber-400 px-4 py-2 font-bold" disabled={busy} onClick={() => void create()}>
            만들기
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </section>

      <section>
        <h2 className="mb-3 font-bold">내 학급</h2>
        {list === null ? (
          <p>불러오는 중…</p>
        ) : list.length === 0 ? (
          <p className="text-slate-500">아직 만든 학급이 없어요.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <button key={c.id} className="rounded-xl bg-white p-4 text-left shadow-sm hover:bg-amber-50" onClick={() => setOpen(c)}>
                <p className="text-lg font-bold">{c.name}</p>
                <p className="font-mono text-2xl tracking-widest text-orange-600">{c.code}</p>
                <p className="text-sm text-slate-500">학생 {c.student_count}명</p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
