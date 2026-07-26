import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Products() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [filterCat, setFilterCat] = useState('all')
  const [loading, setLoading] = useState(true)
  const [editProduct, setEditProduct] = useState(null)
  const [editName, setEditName] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editDetails, setEditDetails] = useState('')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
    ])
    if (prodRes.data) setProducts(prodRes.data)
    if (catRes.data) setCategories(catRes.data)
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return

    const product = products.find((p) => p.id === id)
    if (product?.images && product.images.length > 0) {
      const fileNames = product.images.map((url) => url.split('/').pop())
      await supabase.storage.from('product-images').remove(fileNames)
    }

    const { error } = await supabase.from('products').delete().eq('id', id)
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== id))
    }
  }

  function startEdit(product) {
    setEditProduct(product.id)
    setEditName(product.name)
    setEditQuantity(product.quantity)
    setEditCategoryId(product.category_id)
    setEditDetails(product.details || '')
  }

  function cancelEdit() {
    setEditProduct(null)
  }

  async function saveEdit(id) {
    const { error } = await supabase
      .from('products')
      .update({ name: editName, quantity: parseInt(editQuantity), category_id: editCategoryId, details: editDetails })
      .eq('id', id)

    if (!error) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, name: editName, quantity: parseInt(editQuantity), category_id: editCategoryId, details: editDetails }
            : p
        )
      )
      setEditProduct(null)
    }
  }

  const images = (product) => {
    if (!product.images) return []
    if (typeof product.images === 'string') {
      try { return JSON.parse(product.images) } catch { return [] }
    }
    return product.images || []
  }

  const filtered = filterCat === 'all'
    ? products
    : products.filter((p) => String(p.category_id) === filterCat)

  return (
    <div className="products-page">
      <h2>المنتجات</h2>

      <div className="filter-bar">
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="all">كل الاصناف</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="loading">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="empty">لا توجد منتجات</p>
      ) : (
        <div className="products-grid">
          {filtered.map((product) => (
            <div key={product.id} className="product-card">
              <div className="product-image">
                {images(product).length > 0 ? (
                  <img
                    src={images(product)[0]}
                    alt={product.name}
                    onClick={() => setLightbox({ product, index: 0 })}
                  />
                ) : (
                  <div className="no-image">لا توجد صورة</div>
                )}
                {images(product).length > 1 && (
                  <span className="image-count">{images(product).length} صور</span>
                )}
              </div>
              <div className="product-info">
                {editProduct === product.id ? (
                  <>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="الاسم" />
                    <input type="number" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} placeholder="العدد" />
                    <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <textarea value={editDetails} onChange={(e) => setEditDetails(e.target.value)} placeholder="تفاصيل" rows={2} />
                    <div className="edit-actions">
                      <button className="save-btn" onClick={() => saveEdit(product.id)}>حفظ</button>
                      <button className="cancel-btn" onClick={cancelEdit}>إلغاء</button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3>{product.name}</h3>
                    <p>العدد: {product.quantity}</p>
                    <p>الصنف: {product.categories?.name}</p>
                    {product.details && <p className="details">{product.details}</p>}
                    <div className="product-actions">
                      <button className="edit-btn" onClick={() => startEdit(product)}>تعديل</button>
                      <button className="delete-btn" onClick={() => handleDelete(product.id)}>حذف</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}>&times;</button>
            <img src={images(lightbox.product)[lightbox.index]} alt={lightbox.product.name} />
            {images(lightbox.product).length > 1 && (
              <div className="lightbox-nav">
                <button
                  onClick={() => setLightbox((prev) => ({ ...prev, index: prev.index === 0 ? images(prev.product).length - 1 : prev.index - 1 }))}
                >
                  &#10094;
                </button>
                <span>{lightbox.index + 1} / {images(lightbox.product).length}</span>
                <button
                  onClick={() => setLightbox((prev) => ({ ...prev, index: prev.index === images(prev.product).length - 1 ? 0 : prev.index + 1 }))}
                >
                  &#10095;
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}