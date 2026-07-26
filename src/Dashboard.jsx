import { useState } from 'react'
import AddProduct from './AddProduct'
import Products from './Products'

export default function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('add')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleProductAdded = () => {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>thestore</h1>
        <button className="logout-btn" onClick={onLogout}>تسجيل خروج</button>
      </div>

      <div className="dashboard-content">
        {tab === 'add' ? (
          <AddProduct onProductAdded={handleProductAdded} />
        ) : (
          <Products key={refreshKey} onUpdate={handleProductAdded} />
        )}
      </div>

      <nav className="bottom-nav">
        <button
          className={tab === 'add' ? 'active' : ''}
          onClick={() => setTab('add')}
        >
          اضافة منتج
        </button>
        <button
          className={tab === 'products' ? 'active' : ''}
          onClick={() => setTab('products')}
        >
          المنتجات
        </button>
      </nav>
    </div>
  )
}