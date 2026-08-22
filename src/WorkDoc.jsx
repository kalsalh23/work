import { useState, useRef } from 'react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { supabase } from './supabaseClient'

export default function WorkDoc() {
  const [form, setForm] = useState({
    deliveryNumber: '',
    docDate: new Date().toISOString().slice(0,10),
    name: '',
    giftType: '',
    description: '',
    officialEntity: '',
    donorCountry: '',
    recipientCountry: '',
    visitType: '',
  })
  const [images, setImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const docRef = useRef(null)

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
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
            if (width > height) { height = (height / width) * MAX; width = MAX } else { width = (width / height) * MAX; height = MAX }
          }
          canvas.width = width; canvas.height = height
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob((blob) => {
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
            resolve(compressed)
          }, 'image/jpeg', 0.6)
        }
      }
    })
  }

  async function handleFinalSave() {
    if(!form.name){ alert('الاسم مطلوب'); return }
    setSaving(true)
    try{
      const imageUrls = []
      for(const image of images){
        const compressed = await compressImage(image)
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, compressed)
        if(!uploadError){
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName)
          imageUrls.push(urlData.publicUrl)
        }
      }
      // محاولة حفظ في جدول products مع كل الحقول + fallback
      const quantity = parseInt(form.deliveryNumber) || 1
      const payload = {
        name: form.name,
        quantity: isNaN(quantity) ? 1 : quantity,
        images: imageUrls,
        details: form.description || null,
        gift_type: form.giftType || null,
        gift_description: form.description || null,
        archive_date: form.docDate || new Date().toISOString().slice(0,10),
        received_date: form.docDate || null,
        delivery_date: form.docDate || null,
        donor_country: form.donorCountry || null,
        estimated_price: null,
        occasion: form.visitType || null,
        // حقول إضافية قد لا تكون موجودة في products - نحاول إرسالها وسيتم تجاهلها إذا لم توجد عبر fallback
        recipient_country: form.recipientCountry || null,
        official_entity: form.officialEntity || null,
        visit_type: form.visitType || null,
        delivery_number: form.deliveryNumber || null,
      }
      let { error } = await supabase.from('products').insert(payload)
      if(error && (error.message.includes('column') || error.message.includes('schema cache'))){
        // fallback للسكيما القديمة - احفظ الحقول الإضافية داخل details
        const fallbackDetails = `الرقم:${form.deliveryNumber} | النوع:${form.giftType} | الجهة:${form.officialEntity} | المهدي:${form.donorCountry} | المستلم:${form.recipientCountry} | الزيارة:${form.visitType} | الوصف:${form.description}`
        const fallback = {
          name: payload.name,
          quantity: payload.quantity,
          images: payload.images,
          details: fallbackDetails,
          gift_type: payload.gift_type,
          gift_description: payload.gift_description,
          archive_date: payload.archive_date,
          donor_country: payload.donor_country,
          occasion: payload.occasion,
        }
        const { error: e2 } = await supabase.from('products').insert(fallback)
        if(e2) throw e2
        alert('✓ تم الحفظ (وضع متوافق) - شغّل supabase_gifts_migration.sql و supabase_workdoc_update.sql لإضافة الأعمدة الناقصة')
      } else if(error) throw error
      else alert('✓ تم الحفظ النهائي بنجاح')

      // تفريغ بعد الحفظ؟ نبقي البيانات للمعاينة لكن نفرغ الصور
      // setForm({...}); // لا نفرغ للسماح بتحميل PDF بعد الحفظ
    }catch(err){ alert('خطأ في الحفظ: '+err.message) }
    setSaving(false)
  }

  async function generatePDF() {
    setGenerating(true)
    try {
      const input = docRef.current
      const canvas = await html2canvas(input, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      let heightLeft = pdfHeight, position = 0
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight)
      heightLeft -= pdf.internal.pageSize.getHeight()
      while (heightLeft > 0) { position = heightLeft - pdfHeight; pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight); heightLeft -= pdf.internal.pageSize.getHeight() }
      const fileName = `توثيق_${form.name || form.deliveryNumber || 'وثيقة'}_${form.docDate || new Date().toLocaleDateString('en-CA')}.pdf`
      pdf.save(fileName)
    } catch (err) { alert('فشل إنشاء PDF: ' + err.message) }
    setGenerating(false)
  }

  const labelStyle = {fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:6, display:'flex', alignItems:'center', gap:6}
  const inputStyle = {width:'100%', padding:'12px 14px', border:'2px solid #E2E8F0', borderRadius:12, background:'#F9FAFB', fontSize:'0.9rem'}

  return (
    <div className="workdoc">
      <div className="page-title" style={{display:'flex', alignItems:'center', gap:10, marginBottom:16}}>
        <div className="title-icon" style={{width:40,height:40, background:'linear-gradient(135deg,#D4AF37,#B8942F)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center'}}>📋</div>
        <h2>توثيق - أرشفة هدية</h2>
      </div>
      <p style={{fontSize:12, color:'#64748B', background:'white', padding:'8px 12px', borderRadius:8, border:'1px solid #E2E8F0', maxWidth:900, margin:'0 auto 16px'}}>أدخل بيانات التوثيق: الرقم هو رقم القطع. جميع الحقول ستظهر في المعاينة والـ PDF. يمكنك رفع صورة ثم الحفظ النهائي.</p>

      <div className="workdoc-layout">
        <div className="workdoc-form" style={{flex:1}}>
          {/* الرقم + التاريخ + الاسم */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:12}}>
            <div className="form-card"><span style={labelStyle}>الرقم (رقم القطع) *</span><input name="deliveryNumber" value={form.deliveryNumber} onChange={handleChange} placeholder="مثال: 001" style={inputStyle} /></div>
            <div className="form-card"><span style={labelStyle}>التاريخ *</span><input type="date" name="docDate" value={form.docDate} onChange={handleChange} style={inputStyle} /></div>
            <div className="form-card"><span style={labelStyle}>الأسم *</span><input name="name" value={form.name} onChange={handleChange} placeholder="اسم الهدية / القطعة" style={inputStyle} /></div>
          </div>

          {/* النوع + الوصف */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, marginTop:12}}>
            <div style={{display:'flex', flexDirection:'column', gap:12}}>
              <div className="form-card"><span style={labelStyle}>النوع</span><input name="giftType" value={form.giftType} onChange={handleChange} placeholder="نوع الهدية" style={inputStyle} /></div>
              <div className="form-card"><span style={labelStyle}>نوع الزيارة</span>
                <select name="visitType" value={form.visitType} onChange={handleChange} style={inputStyle}>
                  <option value="">اختر نوع الزيارة</option>
                  <option value="رسمية">رسمية</option>
                  <option value="ودية">ودية</option>
                  <option value="بروتوكولية">بروتوكولية</option>
                  <option value="عمل">عمل</option>
                  <option value="تكريم">تكريم</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>
            </div>
            <div className="form-card"><span style={labelStyle}>الوصف</span><textarea name="description" value={form.description} onChange={handleChange} placeholder="وصف تفصيلي للهدية" rows={6} style={{...inputStyle, resize:'vertical'}} /></div>
          </div>

          {/* الجهة + البلدين */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginTop:12}}>
            <div className="form-card"><span style={labelStyle}>الجهة الرسمية</span><input name="officialEntity" value={form.officialEntity} onChange={handleChange} placeholder="مثال: وزارة الخارجية" style={inputStyle} /></div>
            <div className="form-card"><span style={labelStyle}>البلد المهدي</span><input name="donorCountry" value={form.donorCountry} onChange={handleChange} placeholder="مثال: السعودية" style={inputStyle} /></div>
            <div className="form-card"><span style={labelStyle}>البلد المستلم</span><input name="recipientCountry" value={form.recipientCountry} onChange={handleChange} placeholder="مثال: سوريا" style={inputStyle} /></div>
          </div>

          {/* الصورة */}
          <div className="form-card" style={{marginTop:12}}>
            <span style={labelStyle}>رفع الصورة</span>
            <div className="image-upload">
              <div className="image-buttons">
                <label className="image-label" style={{flex:1}}>
                  <span className="upload-icon">📂</span>
                  <span>اختيار من الملفات</span>
                  <input type="file" accept="image/*" multiple onChange={handleImages} hidden />
                </label>
                <label className="image-label" style={{flex:1}}>
                  <span className="upload-icon">📸</span>
                  <span>تصوير مباشر</span>
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handleImages} hidden />
                </label>
              </div>
              {imagePreviews.length > 0 && (
                <div className="image-previews" style={{marginTop:12}}>
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="preview-item">
                      <img src={preview} alt={`صورة ${index + 1}`} />
                      <button type="button" className="remove-img-small" onClick={() => removeImage(index)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* أزرار الحفظ النهائي و PDF */}
          <div style={{display:'flex', gap:10, marginTop:12}}>
            <button onClick={handleFinalSave} disabled={saving} style={{flex:1, padding:14, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', color:'white', border:'none', borderRadius:12, fontWeight:800, cursor:'pointer', opacity: saving?0.6:1}}>
              {saving ? 'جاري الحفظ...' : '💾 الحفظ النهائي'}
            </button>
            <button onClick={generatePDF} disabled={generating} className="pdf-btn" style={{flex:1, marginTop:0}}>
              {generating ? 'جاري...' : '📥 تحميل PDF'}
            </button>
          </div>
        </div>

        {/* معاينة */}
        <div className="workdoc-preview-section">
          <div className="preview-header"><span className="preview-icon">👁</span><span>معاينة المستند</span></div>
          <div className="workdoc-preview" ref={docRef}>
            <div className="doc-header"><h2>وثيقة توثيق هدية</h2><p>التاريخ: {form.docDate || new Date().toLocaleDateString('ar-SA')}</p></div>
            <table className="doc-table"><tbody>
              {form.deliveryNumber && <tr><td className="doc-label">الرقم (رقم القطع)</td><td>{form.deliveryNumber}</td></tr>}
              {form.docDate && <tr><td className="doc-label">التاريخ</td><td>{form.docDate}</td></tr>}
              {form.name && <tr><td className="doc-label">الأسم</td><td>{form.name}</td></tr>}
              {form.giftType && <tr><td className="doc-label">النوع</td><td>{form.giftType}</td></tr>}
              {form.officialEntity && <tr><td className="doc-label">الجهة الرسمية</td><td>{form.officialEntity}</td></tr>}
              {form.donorCountry && <tr><td className="doc-label">البلد المهدي</td><td>{form.donorCountry}</td></tr>}
              {form.recipientCountry && <tr><td className="doc-label">البلد المستلم</td><td>{form.recipientCountry}</td></tr>}
              {form.visitType && <tr><td className="doc-label">نوع الزيارة</td><td>{form.visitType}</td></tr>}
            </tbody></table>
            {form.description && <div className="doc-section"><h3>الوصف</h3><p>{form.description}</p></div>}
            {imagePreviews.length > 0 && <div className="doc-section"><h3>الصور ({imagePreviews.length})</h3><div className="doc-images">{imagePreviews.map((preview, index) => (<img key={index} src={preview} alt={`صورة ${index + 1}`} />))}</div></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
