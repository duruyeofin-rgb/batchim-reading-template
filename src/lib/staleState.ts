// 서버 함수가 "상태가 바뀌었어요"(교사 초기화, 다른 기기가 먼저 끝냄, 조건 미충족)를 알리는 오류 코드.
// BR001 이 새 코드다. 40001(serialization_failure)은 Supabase 의 PostgREST 14 가 잠깐 생긴 오류로 보고
// 끝없이 다시 시도해서 서버를 붙잡으므로 서버 함수에서 더 이상 쓰지 않는다.
// 서버 수정 전후와 아직 새로 고치지 않은 기기를 모두 받으려고 두 코드를 함께 인정한다.
export const STALE_STATE_CODE = 'BR001'
const STALE_STATE_CODES: readonly string[] = [STALE_STATE_CODE, '40001']

export const isStaleStateError = (e: unknown): boolean => {
  const code = (e as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' && STALE_STATE_CODES.includes(code)
}
