import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Header() {
  const { signOut } = useAuth()
  const location = useLocation()

  return (
    <header className="syrian-header">
      <div>
        <h1>سورية 2026</h1>
        <div className="subtitle">نظام إدارة المنتجات</div>
      </div>

      <nav className="nav-links">
        <Link
          to="/dashboard"
          className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
        >
          لوحة التحكم
        </Link>
        <Link
          to="/products"
          className={`nav-link ${location.pathname === '/products' ? 'active' : ''}`}
        >
          المنتجات
        </Link>
        <button className="logout-btn" onClick={signOut}>
          تسجيل خروج
        </button>
      </nav>
    </header>
  )
}