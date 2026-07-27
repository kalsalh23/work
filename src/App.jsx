import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Login from './Login'
import Dashboard from './Dashboard'
import ResetPassword from './ResetPassword'

function App() {
  const [isAuth, setIsAuth] = useState(false)

  return (
    <Routes>
      <Route path="/update-password" element={<ResetPassword />} />
      <Route path="/*" element={
        !isAuth ? <Login onLogin={() => setIsAuth(true)} /> : <Dashboard onLogout={() => setIsAuth(false)} />
      } />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App