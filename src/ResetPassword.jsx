import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const userEmail = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (type === 'recovery' && accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(async () => {
          const { data } = await supabase.auth.getUser()
          if (data?.user?.email) userEmail.current = data.user.email
          setReady(true)
        })
        .catch(() => setError('رابط إعادة التعيين غير صالح أو منتهي الصلاحية'))
    } else {
      setError('رابط غير صالح')
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('كلمة السر غير متطابقة')
      return
    }
    if (password.length < 6) {
      setError('كلمة السر يجب أن تكون 6 أحرف على الأقل')
      return
    }

    setLoading(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (!updateError) {
      setSuccess(true)
      setTimeout(() => navigate('/'), 3000)
    } else {
      setError('فشل تحديث كلمة السر: ' + updateError.message)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <img src="/syria-logo.svg" alt="سوريا" className="login-logo-img" />
          </div>
          <h1>تم التحديث بنجاح ✅</h1>
          <p className="login-subtitle">سيتم تحويلك إلى صفحة تسجيل الدخول...</p>
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
        <h1>إعادة تعيين كلمة السر</h1>
        <p className="login-subtitle">أدخل كلمة السر الجديدة</p>

        {error && !ready && <p className="error">⚠ {error}</p>}

        {!ready && !error && (
          <p className="loading-text">جاري التحقق من الرابط...</p>
        )}

        {ready && (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <input
                type="password"
                placeholder="كلمة السر الجديدة"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <span className="input-icon">🔒</span>
            </div>
            <div className="input-group">
              <input
                type="password"
                placeholder="تأكيد كلمة السر"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
              <span className="input-icon">🔒</span>
            </div>
            {error && <p className="error">⚠ {error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ كلمة السر الجديدة'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
