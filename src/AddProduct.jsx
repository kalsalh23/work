import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function AddProduct({ onProductAdded }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [categoryId, setCategoryId] = useState('')
  // الحقول الجديدة لنظام الهدايا (تم ازالة تاريخ الارشفة، تاريخ التسليم، البلد المهدي، السعر التقريبي حسب الطلب)
  const [giftType, setGiftType] = useState('')
  const [giftDescription, setGiftDescription] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [occasion, setOccasion] = useState('')

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
      setGiftType(data[0].name)
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
    if (!name || !quantity) {
      alert('يرجى تعبئة اسم الهدية وعددها')
      return
    }
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

      const payload = {
        name: name.trim(),
        quantity: parseInt(quantity),
        images: imageUrls,
        category_id: categoryId || null,
        details: giftDescription || null,
        // الحقول الجديدة (المتبقية بعد الحذف)
        gift_type: giftType || (categories.find(c=>String(c.id)===String(categoryId))?.name) || null,
        gift_description: giftDescription || null,
        received_date: receivedDate || null,
        occasion: occasion || null,
      }

      const { error } = await supabase.from('products').insert(payload)

      if (error) {
        // fallback for DB without new columns (تجاهل الحقول الجديدة)
        if (error.message.includes('column') || error.message.includes('schema cache')) {
          const fallback = {
            name: payload.name,
            quantity: payload.quantity,
            images: payload.images,
            category_id: payload.category_id,
            details: payload.details,
          }
          const { error: e2 } = await supabase.from('products').insert(fallback)
          if (e2) throw e2
          alert('تم الحفظ (الوضع المتوافق) - يرجى تشغيل supabase_gifts_migration.sql في Supabase لإضافة الحقول الجديدة')
        } else {
          throw error
        }
      }

      // reset
      setName('')
      setQuantity('')
      setImages([])
      setImagePreviews([])
      setCategoryId('')
      setGiftType('')
      setGiftDescription('')
      setReceivedDate('')
      setOccasion('')
      onProductAdded()
      alert('✓ تم حفظ الهدية بنجاح')
    } catch (err) {
      alert('خطأ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="add-product">
      <div className="page-title">
        <div className="title-icon">＋</div>
        <h2>إضافة هدية / منتج</h2>
      </div>
      <form onSubmit={handleSubmit}>
        {/* اسم الهدية + العدد */}
        <div className="form-row" style={{display:'flex', gap:12}}>
          <div className="form-card" style={{flex:2}}>
            <span className="card-label">اسم الهدية *</span>
            <input
              type="text"
              placeholder="أدخل اسم الهدية"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-card" style={{flex:1}}>
            <span className="card-label">عدد الهدايا *</span>
            <input
              type="number"
              min="1"
              placeholder="العدد"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
        </div>

        {/* الصنف + نوع الهدية */}
        <div className="form-card">
          <span className="card-label">الصنف / نوع الهدية</span>
          <div className="category-row">
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                const cat = categories.find(c=>String(c.id)===e.target.value)
                if(cat) setGiftType(cat.name)
              }}
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
          <input
            type="text"
            placeholder="نوع الهدية (مثال: درع تكريمي، لوحة، مجسم...)"
            value={giftType}
            onChange={(e)=> setGiftType(e.target.value)}
            style={{marginTop:10}}
          />
        </div>

        {/* وصف الهدية */}
        <div className="form-card">
          <span className="card-label">وصف الهدية</span>
          <textarea
            placeholder="أدخل وصف تفصيلي للهدية (المواد، الأبعاد، الحالة...)"
            value={giftDescription}
            onChange={(e) => setGiftDescription(e.target.value)}
            rows={3}
          />
        </div>

        {/* تاريخ الاستلام + المناسبة (تم حذف تاريخ الارشفة، تاريخ التسليم، البلد المهدي، السعر التقريبي) */}
        <div className="form-card">
          <span className="card-label">تاريخ الاستلام</span>
          <input type="date" value={receivedDate} onChange={(e)=> setReceivedDate(e.target.value)} />
        </div>

        <div className="form-card">
          <span className="card-label">المناسبة الرسمية</span>
          <input type="text" placeholder="مثال: عيد الجلاء، زيارة رسمية، مؤتمر..." value={occasion} onChange={(e)=> setOccasion(e.target.value)} />
        </div>

        {/* الصور */}
        <div className="form-card">
          <span className="card-label">الصور</span>
          <div className="image-upload">
            <div className="image-buttons">
              <label className="image-label">
                <span className="upload-icon">📂</span>
                <span>اختيار من الملفات</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImages}
                  hidden
                />
              </label>
              <label className="image-label">
                <span className="upload-icon">📸</span>
                <span>تصوير مباشر</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImages}
                  hidden
                />
              </label>
            </div>
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

        <button type="submit" disabled={loading}>
          {loading ? 'جاري الحفظ...' : '✓ حفظ الهدية'}
        </button>
      </form>
    </div>
  )
}
