import { useState } from 'react'
import { DEFAULT_RESET, RESET_CHOICES, type ResetOptions, hasAnyChoice } from './reset'

/**
 * 기록 초기화 확인 창. 무엇을 지울지 고르고, 한 번 더 확인한 뒤에 지운다.
 * needWord 가 있으면(학급 전체) 그 낱말을 직접 써야 버튼이 눌린다.
 */
export default function ResetDialog({
  title,
  lead,
  needWord,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string
  lead: string
  needWord?: string
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: (o: ResetOptions) => void
}) {
  const [o, setO] = useState<ResetOptions>(DEFAULT_RESET)
  const [typed, setTyped] = useState('')
  const canGo = hasAnyChoice(o) && (!needWord || typed.trim() === needWord) && !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-xl font-bold text-red-700">⚠ {title}</h3>
        <p className="mt-2 text-sm text-slate-700">{lead}</p>
        <p className="mt-1 text-sm font-bold text-red-700">지운 기록은 되돌릴 수 없어요. 지울 것을 골라 주세요.</p>

        <ul className="mt-3 space-y-2">
          {RESET_CHOICES.map((c) => (
            <li key={c.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-2 hover:bg-slate-50">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={o[c.key]} disabled={busy} onChange={(e) => setO({ ...o, [c.key]: e.target.checked })} />
                <span>
                  <span className="block font-bold">{c.label}</span>
                  <span className="block text-xs text-slate-500">{c.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-slate-500">학생이 지금 앱을 켜 두었다면, 몇십 초 안에 자동으로 처음 화면으로 돌아가요.</p>

        {needWord && (
          <label className="mt-3 block text-sm">
            계속하려면 <b>‘{needWord}’</b>라고 입력해 주세요.
            <input className="mt-1 block w-full rounded-lg border p-2" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" />
          </label>
        )}

        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="tbtn" onClick={onCancel} disabled={busy}>취소</button>
          <button className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-40" disabled={!canGo} onClick={() => onConfirm(o)}>
            {busy ? '초기화하는 중…' : '초기화하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
