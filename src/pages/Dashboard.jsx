import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [quantity, setQuantity] = useState('')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploading, setUploading] = useState(false)
  const [products, setProducts] = useState([])
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(4)
    if (data) setProducts(data)
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImage(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setUploading(true)

    try {
      let imageUrl = ''

      if (image) {
        const fileExt = image.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, image)

        if (uploadError) throw new Error('فشل رفع الصورة')

        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName)

        imageUrl = urlData.publicUrl
      }

      const { error: insertError } = await supabase
        .from('products')
        .insert([{ name, type, quantity: parseInt(quantity), image_url: imageUrl, user_id: user.id }])

      if (insertError) throw insertError

      setSuccess('تمت إضافة المنتج بنجاح ✓')
      setName('')
      setType('')
      setQuantity('')
      setImage(null)
      setImagePreview(null)
      fetchProducts()
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إضافة المنتج')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Header />
      <div className="container">
        <h1 className="page-title">لوحة التحكم</h1>

        <div className="dashboard-grid">
          <div className="syrian-card">
            <h2 style={{ fontFamily: 'var(--font-primary)', color: 'var(--primary-dark)', marginBottom: '1.5rem' }}>
              إضافة منتج جديد
            </h2>

            <form onSubmit={handleSubmit}>
              {error && <div className="error-msg">{error}</div>}
              {success && <div className="success-msg">{success}</div>}

              <div className="form-group">
                <label>اسم المنتج</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="أدخل اسم المنتج"
                  required
                />
              </div>

              <div className="form-group">
                <label>نوع المنتج</label>
                <select value={type} onChange={(e) => setType(e.target.value)} required>
                  <option value="">اختر النوع</option>
                  <option value="غذائي">غذائي</option>
                  <option value="نسيجي">نسيجي</option>
                  <option value="حرفي">حرفي</option>
                  <option value="زراعي">زراعي</option>
                  <option value="صناعي">صناعي</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              <div className="form-group">
                <label>الكمية</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  min="1"
                  required
                />
              </div>

              <div className="form-group">
                <label>صورة المنتج</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                />
                {imagePreview && (
                  <div className="image-preview">
                    <img src={imagePreview} alt="معاينة" />
                  </div>
                )}
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={uploading}>
                {uploading ? 'جاري الرفع...' : 'إضافة المنتج'}
              </button>
            </form>
          </div>

          <div className="syrian-card">
            <h2 style={{ fontFamily: 'var(--font-primary)', color: 'var(--primary-dark)', marginBottom: '1.5rem' }}>
              أحدث المنتجات
            </h2>

            {products.length === 0 ? (
              <div className="empty-state">
                <p>لا توجد منتجات بعد</p>
                <button className="btn-wheat" style={{ marginTop: '1rem' }} onClick={() => navigate('/products')}>
                  عرض جميع المنتجات
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {products.map((product) => (
                  <div key={product.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.75rem',
                    background: 'var(--wheat-light)',
                    borderRadius: '8px'
                  }}>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{ width: 50, height: 50, borderRadius: 8, objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: 50, height: 50, borderRadius: 8, background: 'var(--wheat)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem' }}>
                        📦
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>{product.name}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--charcoal)' }}>
                        {product.type} · الكمية: {product.quantity}
                      </div>
                    </div>
                  </div>
                ))}
                <button className="btn-wheat" style={{ width: '100%' }} onClick={() => navigate('/products')}>
                  عرض جميع المنتجات
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}