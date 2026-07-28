import { useState } from 'react'
import AddProduct from './AddProduct'
import Products from './Products'
import WorkDoc from './WorkDoc'

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
          <h1>thestore</h1>
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
        ) : (
          <WorkDoc />
        )}
      </div>

      <nav className="bottom-nav">
        <button
          className={tab === 'add' ? 'active' : ''}
          onClick={() => setTab('add')}
        >
          <span className="nav-icon">＋</span>
          اضافة منتج
        </button>
        <button
          className={tab === 'products' ? 'active' : ''}
          onClick={() => setTab('products')}
        >
          <span className="nav-icon">📦</span>
          المنتجات
        </button>
        <button
          className={tab === 'workdoc' ? 'active' : ''}
          onClick={() => setTab('workdoc')}
        >
          <span className="nav-icon">📋</span>
          توثيق العمل
        </button>
      </nav>
    </div>
  )
}