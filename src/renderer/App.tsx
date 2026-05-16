import { Routes, Route, Navigate } from 'react-router-dom'
import DesktopLayout from '@/layouts/DesktopLayout'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route path="/workspace" element={<DesktopLayout />} />
      <Route path="/workspace/:projectId" element={<DesktopLayout />} />
    </Routes>
  )
}
