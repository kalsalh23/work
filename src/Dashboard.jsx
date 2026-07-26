import { useState } from 'react'
import AddProduct from './AddProduct'
import Products from './Products'
import BarcodeScanner from './BarcodeScanner'

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
        ) : tab === 'scan' ? (
          <BarcodeScanner key={refreshKey} />
        ) : (
          <Products key={refreshKey} onUpdate={handleProductAdded} />
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
          className={tab === 'scan' ? 'active' : ''}
          onClick={() => setTab('scan')}
        >
          <span className="nav-icon">📷</span>
          مسح المنتج
        </button>
        <button
          className={tab === 'products' ? 'active' : ''}
          onClick={() => setTab('products')}
        >
          <span className="nav-icon">📦</span>
          المنتجات
        </button>
      </nav>
    </div>
  )
}