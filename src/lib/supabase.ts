import { createClient } from '@supabase/supabase-js'
import { normalizeSupabaseUrl } from './supabaseUrl'

// 환경 변수에 섞여 들어온 보이지 않는 문자(BOM)·공백·줄바꿈을 제거한다
const clean = (v: string | undefined) => v?.replace(/[^\x21-\x7e]/g, '')
const url = normalizeSupabaseUrl(clean(import.meta.env.VITE_SUPABASE_URL as string | undefined))
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

export const supabaseConfigured = Boolean(url && key)

// 공개용(anon) 키만 사용합니다. service_role 키는 절대 넣지 않습니다.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
