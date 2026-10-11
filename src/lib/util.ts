export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

export const FOOTER_TEXT = 'ⓒ 2026 연두부형 · MIT 라이선스'

/** 학급 코드는 숫자 6자리 (한글을 배우는 학생도 입력할 수 있게). QR 링크로도 들어올 수 있다 */
export const CODE_DIGITS = '0123456789'

export function randomCode(len = 6) {
  let s = ''
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  for (let i = 0; i < len; i++) s += CODE_DIGITS[buf[i] % CODE_DIGITS.length]
  return s
}

/** 학생 입장용 주소 (QR 에 넣는다) */
export const joinUrl = (_code: string) => `${window.location.origin}/join`

export const fmtDate = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
