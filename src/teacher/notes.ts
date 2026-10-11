// 교사 피드백 메모 (teacher_notes 표). 표가 아직 없으면 성장 화면은 그대로 쓰이고 메모 칸에만 안내가 나온다.
import { supabase } from '../lib/supabase'

export interface NoteRow {
  id: number
  student_id: string
  class_id: string
  note: string
  created_at: string
}

type DbError = { code?: string; message?: string } | null

/** 표가 아직 만들어지지 않은 오류인가 */
export const notesTableMissing = (e: DbError) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /teacher_notes/.test(e.message ?? '') && /exist|schema cache/i.test(e.message ?? ''))

export async function fetchNotes(studentId: string): Promise<{ rows: NoteRow[]; missing: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('teacher_notes')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) return { rows: [], missing: notesTableMissing(error), error: notesTableMissing(error) ? null : error.message }
  return { rows: (data ?? []) as NoteRow[], missing: false, error: null }
}

export async function addNote(studentId: string, classId: string, note: string) {
  return supabase.from('teacher_notes').insert({ student_id: studentId, class_id: classId, note: note.trim() })
}

export async function deleteNote(id: number) {
  return supabase.from('teacher_notes').delete().eq('id', id)
}
