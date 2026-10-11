// 학생 기기에 있는 값과 서버 값이 달라졌는지 (교사가 초기화·직업 되돌리기를 했을 때 기기가 알아채도록)
import type { Student } from './api'

type Core = Pick<Student, 'dream_total' | 'character' | 'job' | 'items'>

/** 서버에서 바뀐 것이 있으면 true. 별, 캐릭터, 직업, 연 요소(items) 를 견준다 */
export const serverStateDiffers = (local: Core, server: Core) =>
  local.dream_total !== server.dream_total ||
  (local.character ?? null) !== (server.character ?? null) ||
  (local.job ?? null) !== (server.job ?? null) ||
  local.items.join('|') !== server.items.join('|')

/** 확인해도 되는 때인가: 보낼 기록이 없고, 마지막으로 이 기기에서 값을 바꾼 지 충분히 지났을 때만 */
export const safeToCompare = (pendingCount: number, lastWriteMs: number, nowMs: number, quietMs = 8000) =>
  pendingCount === 0 && nowMs - lastWriteMs >= quietMs
