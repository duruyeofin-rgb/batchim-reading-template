// 교사 로그인은 '아이디 + 비밀번호'를 쓴다.
// Supabase 는 로그인에 이메일 형태가 필요하므로, 아이디를 내부용 가짜 주소로 바꿔 쓴다.
// 이 주소는 실제 이메일이 아니므로 어떤 개인정보도 저장되지 않는다.
export const TEACHER_EMAIL_DOMAIN = 'teacher.batchim.invalid'

/**
 * 교사 가입에 '초대 암호'를 요구할지.
 * true 로 바꾸려면 먼저 supabase/schema.sql 맨 아래의 '교사 초대 암호' 부분을 DB 에 적용해야 한다
 * (적용하지 않고 true 로 두면 가입이 막힌다). 지금은 DB 변경 없이 아이디+비밀번호만으로 가입한다.
 */
export const REQUIRE_INVITE = false

export const ID_RULE ='영문 소문자·숫자·-·_ 3~20자 (실명이나 이메일 주소는 쓰지 마세요)'

export const normalizeId = (s: string) => s.trim().toLowerCase()

export const validId = (id: string) => /^[a-z0-9_-]{3,20}$/.test(id)

export const idToEmail = (id: string) => `${normalizeId(id)}@${TEACHER_EMAIL_DOMAIN}`

/** 화면에 보일 이름: 내부용 주소면 아이디만, 예전에 이메일로 가입한 계정은 그대로(앞부분만 가려서) */
export function displayName(email: string | undefined | null) {
  if (!email) return ''
  const [local, domain] = email.split('@')
  if (domain === TEACHER_EMAIL_DOMAIN) return local
  return `${local.slice(0, 2)}***@${domain}`
}
