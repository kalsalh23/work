import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'
import Dashboard from './Dashboard'
import ResetPassword from './ResetPassword'

function App() {
  const [isAuth, setIsAuth] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAuth(true)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuth(!!session)
    })

    return () => subscription?.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <p className="loading-text">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/update-password" element={<ResetPassword />} />
      <Route path="/*" element={
        !isAuth ? <Login onLogin={() => setIsAuth(true)} /> : <Dashboard onLogout={() => { supabase.auth.signOut(); setIsAuth(false) }} />
      } />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App