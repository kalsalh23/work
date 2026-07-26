import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function AddProduct({ onProductAdded }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [details, setDetails] = useState('')
  const [categories, setCategories] = useState([])
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    const { data } = await supabase.from('categories').select('*').order('name')
    if (data) setCategories(data)
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: newCategory.trim() })
      .select()
    if (error) {
      alert('خطأ في اضافة الصنف: ' + error.message)
      return
    }
    if (data && data[0]) {
      setCategories((prev) => [...prev, data[0]])
      setCategoryId(data[0].id)
      setNewCategory('')
      setShowAddCategory(false)
    }
  }

  function handleImages(e) {
    const files = Array.from(e.target.files)
    setImages((prev) => [...prev, ...files])
    files.forEach((file) => {
      const preview = URL.createObjectURL(file)
      setImagePreviews((prev) => [...prev, preview])
    })
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }

  async function compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (e) => {
        const img = new Image()
        img.src = e.target.result
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX = 1024
          let { width, height } = img
          if (width > MAX || height > MAX) {
            if (width > height) {
              height = (height / width) * MAX
              width = MAX
            } else {
              width = (width / height) * MAX
              height = MAX
            }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob((blob) => {
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
            resolve(compressed)
          }, 'image/jpeg', 0.6)
        }
      }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name || !quantity || !categoryId) return
    setLoading(true)

    try {
      const imageUrls = []

      for (const image of images) {
        const compressed = await compressImage(image)
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, compressed)

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName)
          imageUrls.push(urlData.publicUrl)
        }
      }

      const { error } = await supabase.from('products').insert({
        name,
        quantity: parseInt(quantity),
        images: imageUrls,
        category_id: categoryId,
        details,
      })

      if (!error) {
        setName('')
        setQuantity('')
        setImages([])
        setImagePreviews([])
        setCategoryId('')
        setDetails('')
        onProductAdded()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="add-product">
      <div className="page-title">
        <div className="title-icon">＋</div>
        <h2>اضافة منتج</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-card">
          <span className="card-label">اسم القطعة</span>
          <input
            type="text"
            placeholder="أدخل اسم القطعة"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-card">
          <span className="card-label">عدد القطع</span>
          <input
            type="number"
            placeholder="أدخل العدد"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        <div className="form-card">
          <span className="card-label">الصنف</span>
          <div className="category-row">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">اختر صنف</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <button type="button" onClick={() => setShowAddCategory(true)}>
              ＋ صنف
            </button>
          </div>

          {showAddCategory && (
            <div className="add-category-inline">
              <input
                type="text"
                placeholder="اسم الصنف الجديد"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button type="button" onClick={handleAddCategory}>حفظ</button>
              <button type="button" onClick={() => setShowAddCategory(false)}>إلغاء</button>
            </div>
          )}
        </div>

        <div className="form-card">
          <span className="card-label">الصور</span>
          <div className="image-upload">
            <label className="image-label multi">
              <span className="upload-icon">📸</span>
              {imagePreviews.length > 0 ? (
                <span>اضغط لاضافة المزيد من الصور</span>
              ) : (
                <span>اضغط لاختيار صور</span>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImages}
                hidden
              />
            </label>
            {imagePreviews.length > 0 && (
              <div className="image-previews">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="preview-item">
                    <img src={preview} alt={`صورة ${index + 1}`} />
                    <button type="button" className="remove-img-small" onClick={() => removeImage(index)}>
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="form-card">
          <span className="card-label">تفاصيل اضافية</span>
          <textarea
            placeholder="أدخل تفاصيل اضافية (اختياري)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'جاري الحفظ...' : '✓ حفظ المنتج'}
        </button>
      </form>
    </div>
  )
}