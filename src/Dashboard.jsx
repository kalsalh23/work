import { useState } from 'react'
import AddProduct from './AddProduct'
import Products from './Products'
import WorkDoc from './WorkDoc'
import Delivery from './Delivery'

export default function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('add')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleProductAdded = () => {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="brand">
          <div className="brand-icon">S</div>
          <h1>thestore - نظام الهدايا</h1>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          ← خروج
        </button>
      </div>

      <div className="dashboard-content">
        {tab === 'add' ? (
          <AddProduct onProductAdded={handleProductAdded} />
        ) : tab === 'products' ? (
          <Products key={refreshKey} onUpdate={handleProductAdded} />
        ) : tab === 'delivery' ? (
          <Delivery key={refreshKey} />
        ) : (
          <WorkDoc />
        )}
      </div>

      <nav className="bottom-nav" style={{maxWidth:650}}>
        <button
          className={tab === 'add' ? 'active' : ''}
          onClick={() => setTab('add')}
        >
          <span className="nav-icon">＋</span>
          إضافة هدية
        </button>
        <button
          className={tab === 'products' ? 'active' : ''}
          onClick={() => setTab('products')}
        >
          <span className="nav-icon">📦</span>
          الهدايا
        </button>
        <button
          className={tab === 'delivery' ? 'active' : ''}
          onClick={() => setTab('delivery')}
        >
          <span className="nav-icon">🚚</span>
          تسليم
        </button>
        <button
          className={tab === 'workdoc' ? 'active' : ''}
          onClick={() => setTab('workdoc')}
        >
          <span className="nav-icon">📋</span>
          توثيق
        </button>
      </nav>
    </div>
  )
}
