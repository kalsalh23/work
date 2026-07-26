import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .maybeSingle()

    if (data) {
      onLogin()
    } else {
      setError('البريد الإلكتروني أو كلمة السر خطأ')
    }
    setLoading(false)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img src="/syria-logo.svg" alt="سوريا" className="login-logo-img" />
        </div>
        <h1>الجمهورية العربية السورية</h1>
        <p className="login-subtitle">سجّل الدخول للمتابعة.</p>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <span className="input-icon">✉</span>
          </div>
          <div className="input-group">
            <input
              type="password"
              placeholder="كلمة السر"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="input-icon">🔒</span>
          </div>
          {error && <p className="error">⚠ {error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  )
}