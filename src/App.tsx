import { Route, Routes } from 'react-router-dom'
import StudentApp from './student/StudentApp'
import TeacherApp from './teacher/TeacherApp'

export default function App() {
  return (
    <Routes>
      <Route path="/teacher" element={<TeacherApp />} />
      <Route path="*" element={<StudentApp />} />
    </Routes>
  )
}

