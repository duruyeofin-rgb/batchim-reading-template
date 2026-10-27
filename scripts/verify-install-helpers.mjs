// SQLSTATE 42501 covers table/column privileges and RLS rejection.
export const isPermissionDenied = (error) => error?.code === '42501'
export const probeColumn = (table) => table === 'progress' ? 'student_id' : 'id'
export function tableErrorHint(table, error) {
  const detail = `${table}: ${error.code ?? 'unknown'} (${error.message})`
  if (isPermissionDenied(error)) return `권한 부족: ${detail}. setup.sql 의 GRANT 적용을 확인하세요.`
  if (['42P01', 'PGRST205'].includes(error.code)) return `없는 표: ${detail}. supabase/setup.sql 적용과 스키마 캐시를 확인하세요.`
  return `조회 오류: ${detail}. 표 누락으로 단정할 수 없어요.`
}
