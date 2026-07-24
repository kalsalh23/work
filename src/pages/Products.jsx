import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { supabase } from '../supabaseClient'

export default function Products() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setProducts(data)
    setLoading(false)
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <Header />
      <div className="container">
        <h1 className="page-title">المنتجات</h1>

        <div className="filter-bar">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="ابحث عن منتج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span style={{ color: 'var(--wheat-dark)', fontSize: '0.9rem' }}>
            {filtered.length} منتج
          </span>
        </div>

        {loading ? (
          <div className="loading">جاري تحميل المنتجات...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{search ? 'لا توجد منتجات مطابقة للبحث' : 'لا توجد منتجات بعد'}</p>
          </div>
        ) : (
          <div className="products-grid">
            {filtered.map((product) => (
              <div key={product.id} className="product-card">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} />
                ) : (
                  <div style={{
                    height: 200,
                    background: 'linear-gradient(135deg, var(--wheat), var(--wheat-dark))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '3rem',
                    color: '#fff'
                  }}>
                    📦
                  </div>
                )}
                <div className="product-info">
                  <h3 className="product-name">{product.name}</h3>
                  <p className="product-type">{product.type}</p>
                  <p className="product-qty">الكمية: {product.quantity}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}