import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Login from './Login'
import Dashboard from './Dashboard'

function App() {
  const [isAuth, setIsAuth] = useState(false)

  if (!isAuth) {
    return <Login onLogin={() => setIsAuth(true)} />
  }

  return (
    <Routes>
      <Route path="/*" element={<Dashboard onLogout={() => setIsAuth(false)} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App