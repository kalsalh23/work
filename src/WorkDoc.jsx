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
  const [images, setImages] = useState([]) // File objects قبل الرفع
  const [imagePreviews, setImagePreviews] = useState([]) // blob URLs للمعاينة
  const [savedImageUrls, setSavedImageUrls] = useState([]) // public URLs بعد الحفظ
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const docRef = useRef(null)

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleImages(e) {
    const files = Array.from(e.target.files)
    if(files.length===0) return
    setImages((prev) => [...prev, ...files])
    files.forEach((file) => {
      const preview = URL.createObjectURL(file)
      setImagePreviews((prev) => [...prev, preview])
    })
    // اعادة تعيين input للسماح باختيار نفس الملف مرة اخرى
    e.target.value = ''
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
    setSavedImageUrls((prev) => prev.filter((_, i) => i !== index))
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
        img.onerror = () => resolve(file)
      }
      reader.onerror = () => resolve(file)
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
        if(uploadError){
          console.error('upload error', uploadError)
          alert('فشل رفع الصورة: '+uploadError.message)
          continue
        }
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName)
        if(urlData?.publicUrl) imageUrls.push(urlData.publicUrl)
      }
      // اذا لم يتم رفع صور جديدة لكن يوجد صور محفوظة سابقاً احتفظ بها
      const finalUrls = imageUrls.length>0 ? imageUrls : savedImageUrls

      const quantity = parseInt(form.deliveryNumber) || 1
      const payload = {
        name: form.name,
        quantity: isNaN(quantity) ? 1 : quantity,
        images: finalUrls,
        details: form.description || null,
        gift_type: form.giftType || null,
        gift_description: form.description || null,
        archive_date: form.docDate || new Date().toISOString().slice(0,10),
        received_date: form.docDate || null,
        delivery_date: form.docDate || null,
        donor_country: form.donorCountry || null,
        estimated_price: null,
        occasion: form.visitType || null,
        recipient_country: form.recipientCountry || null,
        official_entity: form.officialEntity || null,
        visit_type: form.visitType || null,
        delivery_number: form.deliveryNumber || null,
      }
      let { error } = await supabase.from('products').insert(payload)
      if(error && (error.message.includes('column') || error.message.includes('schema cache'))){
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
      else alert('✓ تم الحفظ النهائي بنجاح - يمكنك الآن تحميل PDF وسيظهر بالصور المحفوظة')

      // بعد الحفظ الناجح: استبدل المعاينات بالروابط العامة لضمان ظهورها في PDF بعد اعادة التحميل
      if(finalUrls.length>0){
        // حرر blob القديمة
        imagePreviews.forEach(url=> { try{ URL.revokeObjectURL(url) }catch{} })
        setSavedImageUrls(finalUrls)
        setImagePreviews(finalUrls) // استخدم الروابط العامة للمعاينة والـ PDF
        setImages([]) // تم الرفع
      }
    }catch(err){ alert('خطأ في الحفظ: '+err.message) }
    setSaving(false)
  }

  async function generatePDF() {
    if(!form.name && !form.deliveryNumber){ alert('أدخل الرقم والاسم أولاً'); return }
    setGenerating(true)
    try {
      const input = docRef.current
      // انتظر تحميل كل الصور قبل الالتقاط
      const imgs = input.querySelectorAll('img')
      await Promise.all(Array.from(imgs).map(img => {
        if(img.complete) return Promise.resolve()
        return new Promise(res=>{ img.onload=res; img.onerror=res; setTimeout(res, 2000) })
      }))
      // مهلة صغيرة للتأكد من رسم الصور
      await new Promise(r=> setTimeout(r, 300))

      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          // تأكد من أن الصور في النسخة المستنسخة لها crossOrigin
          clonedDoc.querySelectorAll('img').forEach(img=>{ img.crossOrigin='anonymous'; img.style.maxWidth='100%' })
        }
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      let heightLeft = pdfHeight, position = 0
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight)
      heightLeft -= pdf.internal.pageSize.getHeight()
      while (heightLeft > 0) { position = heightLeft - pdfHeight; pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight); heightLeft -= pdf.internal.pageSize.getHeight() }
      const fileName = `توثيق_${form.name || form.deliveryNumber || 'وثيقة'}_${form.docDate || new Date().toLocaleDateString('en-CA')}.pdf`
      pdf.save(fileName)
    } catch (err) { alert('فشل إنشاء PDF: ' + err.message); console.error(err) }
    setGenerating(false)
  }

  // ستايل موحد: كل حقل في سطر منفصل
  const cardStyle = {background:'var(--card, rgba(255,255,255,0.85))', backdropFilter:'blur(8px)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:16, boxShadow:'0 4px 16px rgba(15,23,42,0.07)'}
  const labelStyle = {fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:6, display:'flex', alignItems:'center', gap:6}
  const inputStyle = {width:'100%', padding:'12px 14px', border:'2px solid #E2E8F0', borderRadius:12, background:'#F9FAFB', fontSize:'0.9rem', fontFamily:'inherit'}

  // الصور المعروضة: بعد الحفظ نعرض الروابط العامة، قبل الحفظ نعرض blob
  const displayImages = savedImageUrls.length>0 && images.length===0 ? savedImageUrls : imagePreviews

  return (
    <div className="workdoc">
      <div className="page-title" style={{display:'flex', alignItems:'center', gap:10, marginBottom:16}}>
        <div className="title-icon" style={{width:40,height:40, background:'linear-gradient(135deg,#D4AF37,#B8942F)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center'}}>📋</div>
        <h2>توثيق - أرشفة هدية</h2>
      </div>
      <p style={{fontSize:12, color:'#64748B', background:'white', padding:'8px 12px', borderRadius:8, border:'1px solid #E2E8F0', maxWidth:700, margin:'0 auto 16px'}}>كل حقل في سطر منفصل. ارفع الصورة ثم اضغط الحفظ النهائي، وبعدها حمّل الـ PDF - الصورة ستظهر الآن بشكل صحيح في الملف المحفوظ.</p>

      <div className="workdoc-layout" style={{display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap'}}>
        <div className="workdoc-form" style={{flex:'1 1 360px', minWidth:300, display:'flex', flexDirection:'column', gap:12}}>
          {/* كل حقل في سطر */}
          <div style={cardStyle}><span style={labelStyle}>الرقم (رقم القطع) * <span style={{flex:1,height:1, background:'linear-gradient(to left, rgba(212,175,55,0.25), transparent)', marginRight:8}}></span></span><input name="deliveryNumber" value={form.deliveryNumber} onChange={handleChange} placeholder="مثال: 001" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>التاريخ *</span><input type="date" name="docDate" value={form.docDate} onChange={handleChange} style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>الأسم *</span><input name="name" value={form.name} onChange={handleChange} placeholder="اسم الهدية / القطعة" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>النوع</span><input name="giftType" value={form.giftType} onChange={handleChange} placeholder="نوع الهدية" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>الوصف</span><textarea name="description" value={form.description} onChange={handleChange} placeholder="وصف تفصيلي للهدية" rows={4} style={{...inputStyle, resize:'vertical'}} /></div>
          <div style={cardStyle}><span style={labelStyle}>الجهة الرسمية</span><input name="officialEntity" value={form.officialEntity} onChange={handleChange} placeholder="مثال: وزارة الخارجية" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>البلد المهدي</span><input name="donorCountry" value={form.donorCountry} onChange={handleChange} placeholder="مثال: السعودية" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>البلد المستلم</span><input name="recipientCountry" value={form.recipientCountry} onChange={handleChange} placeholder="مثال: سوريا" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>نوع الزيارة</span>
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

          {/* رفع الصورة - سطر منفصل */}
          <div style={cardStyle}>
            <span style={labelStyle}>رفع الصورة (تظهر في الملف المحفوظ)</span>
            <div className="image-upload">
              <div className="image-buttons" style={{display:'flex', gap:10}}>
                <label className="image-label" style={{flex:1, minHeight:80}}>
                  <span className="upload-icon">📂</span>
                  <span>اختيار من الملفات</span>
                  <input type="file" accept="image/*" multiple onChange={handleImages} hidden />
                </label>
                <label className="image-label" style={{flex:1, minHeight:80}}>
                  <span className="upload-icon">📸</span>
                  <span>تصوير مباشر</span>
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handleImages} hidden />
                </label>
              </div>
              {displayImages.length > 0 ? (
                <div className="image-previews" style={{marginTop:12, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
                  {displayImages.map((preview, index) => (
                    <div key={index} className="preview-item" style={{position:'relative', aspectRatio:'1', borderRadius:12, overflow:'hidden', border:'2px solid #E2E8F0'}}>
                      <img src={preview} alt={`صورة ${index + 1}`} crossOrigin="anonymous" style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} onError={(e)=>{ e.target.style.display='none'; e.target.nextSibling && (e.target.nextSibling.style.display='block') }} />
                      <div style={{display:'none', position:'absolute', inset:0, background:'#FEF2F2', color:'#DC2626', fontSize:11, alignItems:'center', justifyContent:'center', textAlign:'center', padding:4}}>فشل التحميل</div>
                      <button type="button" className="remove-img-small" onClick={() => removeImage(index)} style={{position:'absolute', top:6, right:6, width:24, height:24, borderRadius:'50%', border:'none', background:'rgba(220,38,38,0.85)', color:'white', cursor:'pointer'}}>&times;</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{fontSize:12, color:'#94A3B8', textAlign:'center', marginTop:8}}>لم يتم اختيار صور بعد</p>
              )}
            </div>
          </div>

          {/* أزرار */}
          <div style={{display:'flex', gap:10}}>
            <button onClick={handleFinalSave} disabled={saving} style={{flex:1, padding:14, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', color:'white', border:'none', borderRadius:12, fontWeight:800, cursor:'pointer', opacity: saving?0.6:1}}>
              {saving ? 'جاري الحفظ...' : '💾 الحفظ النهائي'}
            </button>
            <button onClick={generatePDF} disabled={generating} className="pdf-btn" style={{flex:1, marginTop:0}}>
              {generating ? 'جاري...' : '📥 تحميل PDF'}
            </button>
          </div>
          <p style={{fontSize:11, color:'#64748B', textAlign:'center', background:'#FFFBEB', padding:6, borderRadius:8, border:'1px solid rgba(212,175,55,0.2)'}}>نصيحة: اضغط الحفظ النهائي أولاً ثم حمّل PDF لتظهر الصورة من السيرفر (وليس من الذاكرة المؤقتة) - تم إصلاح مشكلة اختفاء الصورة في الملف المحفوظ.</p>
        </div>

        {/* معاينة - منفصلة */}
        <div className="workdoc-preview-section" style={{flex:'1 1 380px', minWidth:320, position:'sticky', top:20}}>
          <div className="preview-header" style={{display:'flex', alignItems:'center', gap:8, fontWeight:700, color:'#475569', marginBottom:10}}><span className="preview-icon">👁</span><span>معاينة المستند (كل حقل بسطر + الصورة)</span></div>
          <div className="workdoc-preview" ref={docRef} style={{background:'white', borderRadius:16, border:'2px solid #E2E8F0', padding:20, boxShadow:'0 4px 16px rgba(15,23,42,0.07)'}}>
            <div className="doc-header" style={{textAlign:'center', borderBottom:'2px solid #D4AF37', paddingBottom:12, marginBottom:12}}><h2 style={{margin:0}}>وثيقة توثيق هدية</h2><p style={{margin:'4px 0 0', color:'#64748B', fontSize:12}}>التاريخ: {form.docDate || new Date().toLocaleDateString('ar-SA')}</p></div>
            <table className="doc-table" style={{width:'100%', borderCollapse:'collapse'}}><tbody>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0', width:'35%'}}>الرقم (رقم القطع)</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.deliveryNumber || '-'}</td></tr>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0'}}>التاريخ</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.docDate || '-'}</td></tr>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0'}}>الأسم</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.name || '-'}</td></tr>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0'}}>النوع</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.giftType || '-'}</td></tr>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0'}}>الجهة الرسمية</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.officialEntity || '-'}</td></tr>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0'}}>البلد المهدي</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.donorCountry || '-'}</td></tr>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0'}}>البلد المستلم</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.recipientCountry || '-'}</td></tr>
              <tr><td className="doc-label" style={{fontWeight:700, background:'#F8FAFC', padding:'8px 10px', border:'1px solid #E2E8F0'}}>نوع الزيارة</td><td style={{padding:'8px 10px', border:'1px solid #E2E8F0'}}>{form.visitType || '-'}</td></tr>
            </tbody></table>
            <div className="doc-section" style={{marginTop:12}}><h3 style={{color:'#B8942F', borderRight:'3px solid #D4AF37', paddingRight:8, margin:'0 0 6px'}}>الوصف</h3><p style={{margin:0, whiteSpace:'pre-wrap', color:'#475569'}}>{form.description || '-'}</p></div>
            <div className="doc-section" style={{marginTop:12}}><h3 style={{color:'#B8942F', borderRight:'3px solid #D4AF37', paddingRight:8, margin:'0 0 6px'}}>الصور ({displayImages.length})</h3>
              {displayImages.length>0 ? (
                <div className="doc-images" style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginTop:8}}>
                  {displayImages.map((preview, index) => (
                    <img key={index} src={preview} alt={`صورة ${index + 1}`} crossOrigin="anonymous" style={{width:'100%', height:140, objectFit:'cover', borderRadius:8, border:'1px solid #E2E8F0', display:'block'}} />
                  ))}
                </div>
              ) : <p style={{color:'#94A3B8', fontSize:12, textAlign:'center', background:'#F8FAFC', padding:20, borderRadius:8, border:'1px dashed #E2E8F0'}}>لا توجد صور</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
