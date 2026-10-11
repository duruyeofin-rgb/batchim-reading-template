// 저장 실패한 기록을 기기에 임시 보관했다가 다시 전송한다 (네트워크가 잠깐 끊겨도 결과가 사라지지 않게)
import { supabase } from './supabase'

type Op =
  | { k: 'attempt'; row: Record<string, unknown> }
  | { k: 'progress'; row: Record<string, unknown> }
  | { k: 'student'; id: string; patch: Record<string, unknown> }

const KEY = 'batchim.queue.v1'
let flushing: Promise<void> | null = null
let inFlight: Op | null = null

function load(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Op[]
  } catch {
    return []
  }
}
function save(q: Op[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    /* 저장 공간이 없으면 메모리에서만 처리 */
  }
}

export const pendingCount = () => load().length

export function enqueue(op: Op) {
  const q = load()
  if (op.k === 'student') {
    // 같은 학생의 변경은 하나로 합친다 (마지막 값이 이김)
    const prev = q.find((o, i) => !(i === 0 && inFlight) && o.k === 'student' && o.id === op.id)
    if (prev && prev.k === 'student') {
      prev.patch = { ...prev.patch, ...op.patch }
      save(q)
      void flush()
      return
    }
  }
  if (op.k === 'progress') {
    const key = (r: Record<string, unknown>) => `${r.student_id}|${r.unit_id}|${r.level}`
    const i = q.findIndex((o, i) => !(i === 0 && inFlight) && o.k === 'progress' && key(o.row) === key(op.row))
    if (i >= 0) {
      q[i] = op
      save(q)
      void flush()
      return
    }
  }
  q.push(op)
  save(q)
  void flush()
}

async function send(op: Op) {
  if (op.k === 'attempt') return supabase.from('attempts').insert(op.row)
  if (op.k === 'progress') return supabase.from('progress').upsert(op.row, { onConflict: 'student_id,unit_id,level' })
  return supabase.from('students').update(op.patch).eq('id', op.id)
}

/** 대기열을 순서대로 보낸다. 네트워크 오류면 멈추고 나중에 다시 시도, 권한·형식 오류면 버린다. */
export function flush(): Promise<void> {
  if (flushing) return flushing
  flushing = drain().finally(() => { flushing = null })
  return flushing
}

async function drain() {
  try {
    let q = load()
    while (q.length > 0) {
      const op = q[0]
      inFlight = op
      let error: { code?: string; message?: string } | null = null
      try {
        const res = await send(op)
        error = res.error
      } catch (e) {
        error = { message: String(e) }
      }
      if (error && !error.code) break // 네트워크 문제 → 남겨 두고 나중에
      if (error) console.warn('저장 실패(버림):', error.code, error.message)
      q = load().slice(1)
      save(q)
    }
  } finally {
    inFlight = null
  }
}

let started = false
export function startQueueRetry() {
  if (started) return
  started = true
  window.addEventListener('online', () => void flush())
  setInterval(() => void flush(), 15000)
  void flush()
}
