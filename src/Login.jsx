import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (!signInError) {
      const { data: admin } = await supabase
        .from('admins')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (admin) {
        onLogin()
      } else {
        await supabase.auth.signOut()
        setError('ليس لديك صلاحية الدخول')
      }
    } else {
      setError('البريد الإلكتروني أو كلمة السر خطأ')
    }
    setLoading(false)
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetLoading(true)
    setResetError('')

    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('email', resetEmail)
      .maybeSingle()

    if (!admin) {
      setResetError('هذا البريد غير مسجل')
      setResetLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + '/update-password',
    })

    if (error) {
      setResetError('فشل إرسال رابط إعادة التعيين: ' + error.message)
    } else {
      setResetSent(true)
    }
    setResetLoading(false)
  }

  if (showForgot) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <img src="/syria-logo.svg" alt="سوريا" className="login-logo-img" />
          </div>
          <h1>إعادة تعيين كلمة السر</h1>
          <p className="login-subtitle">أدخل بريدك الإلكتروني لاستلام رابط إعادة التعيين.</p>

          {resetSent ? (
            <>
              <div className="success-msg">
                ✅ تم إرسال رابط إعادة تعيين كلمة السر إلى بريدك الإلكتروني
              </div>
              <button type="button" onClick={() => { setShowForgot(false); setResetSent(false); setResetEmail(''); setResetError('') }}>
                العودة لتسجيل الدخول
              </button>
            </>
          ) : (
            <form onSubmit={handleResetPassword}>
              <div className="input-group">
                <input
                  type="email"
                  placeholder="البريد الإلكتروني"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
                <span className="input-icon">✉</span>
              </div>
              {resetError && <p className="error">⚠ {resetError}</p>}
              <button type="submit" disabled={resetLoading}>
                {resetLoading ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
              </button>
              <button type="button" className="back-btn" onClick={() => { setShowForgot(false); setResetError('') }}>
                → العودة لتسجيل الدخول
              </button>
            </form>
          )}
        </div>
      </div>
    )
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
          <button type="button" className="forgot-link" onClick={() => { setShowForgot(true); setError('') }}>
            نسيت كلمة السر؟
          </button>
        </form>
      </div>
    </div>
  )
}