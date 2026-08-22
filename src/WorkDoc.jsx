import { useState, useRef } from 'react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { PDFDocument } from 'pdf-lib'
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
  const [files, setFiles] = useState([]) // [{file, preview, type, name}]
  const [savedUrls, setSavedUrls] = useState([]) // public URLs after save
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const docRef = useRef(null)

  function handleChange(e) { setForm((prev) => ({ ...prev, [e.target.name]: e.target.value })) }

  function handleFiles(e) {
    const selected = Array.from(e.target.files)
    if(selected.length===0) return
    const newEntries = selected.map(f=>{
      const isImage = f.type.startsWith('image/')
      const isPdf = f.type === 'application/pdf'
      let preview = null
      if(isImage) preview = URL.createObjectURL(f)
      // للـ PDF لا ننشئ preview صورة، فقط اسم
      return { file: f, preview, type: isPdf?'pdf': isImage?'image':'other', name: f.name, size: f.size }
    })
    setFiles(prev=> [...prev, ...newEntries])
    e.target.value = ''
  }

  function removeFile(index) {
    setFiles(prev=>{
      const entry = prev[index]
      if(entry?.preview) try{ URL.revokeObjectURL(entry.preview)}catch{}
      return prev.filter((_,i)=>i!==index)
    })
    setSavedUrls(prev=> prev.filter((_,i)=>i!==index))
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
          const MAX = 1400
          let { width, height } = img
          if (width > MAX || height > MAX) {
            if (width > height) { height = (height / width) * MAX; width = MAX } else { width = (width / height) * MAX; height = MAX }
          }
          canvas.width = width; canvas.height = height
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob((blob) => {
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
            resolve(compressed)
          }, 'image/jpeg', 0.75)
        }
        img.onerror = () => resolve(file)
      }
      reader.onerror = () => resolve(file)
    })
  }

  async function handleFinalSave() {
    if(!form.name){ alert('الاسم مطلوب'); return }
    if(files.length===0){ if(!confirm('لم ترفع أي وثيقة، هل تريد الحفظ بدون وثائق؟')) return }
    setSaving(true)
    try{
      const uploadedUrls = []
      for(const entry of files){
        // إذا كان already uploaded (savedUrls) تخطى
        let fileToUpload = entry.file
        // ضغط الصور فقط
        if(entry.type==='image') fileToUpload = await compressImage(entry.file)
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g,'_')}`
        const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, fileToUpload)
        if(uploadError){ console.error(uploadError); alert('فشل رفع: '+entry.name+' - '+uploadError.message); continue }
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName)
        if(urlData?.publicUrl) uploadedUrls.push(urlData.publicUrl)
      }
      const finalUrls = uploadedUrls.length>0 ? uploadedUrls : savedUrls
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
        occasion: form.visitType || null,
        recipient_country: form.recipientCountry || null,
        official_entity: form.officialEntity || null,
        visit_type: form.visitType || null,
        delivery_number: form.deliveryNumber || null,
      }
      let { error } = await supabase.from('products').insert(payload)
      if(error && (error.message.includes('column') || error.message.includes('schema cache'))){
        const fallbackDetails = `الرقم:${form.deliveryNumber} | النوع:${form.giftType} | الجهة:${form.officialEntity} | المهدي:${form.donorCountry} | المستلم:${form.recipientCountry} | الزيارة:${form.visitType} | الوصف:${form.description}`
        const fallback = { name: payload.name, quantity: payload.quantity, images: payload.images, details: fallbackDetails, gift_type: payload.gift_type, gift_description: payload.gift_description, archive_date: payload.archive_date, donor_country: payload.donor_country, occasion: payload.occasion }
        const { error: e2 } = await supabase.from('products').insert(fallback)
        if(e2) throw e2
        alert('✓ تم الحفظ (وضع متوافق)')
      } else if(error) throw error
      else alert(`✓ تم الحفظ النهائي وحفظ ${uploadedUrls.length} وثيقة - الآن يمكنك تحميل الملف الموحد`)

      if(finalUrls.length>0){
        // حول المعاينات لروابط دائمة للـ PDF الموحد
        files.forEach(entry=> { if(entry.preview) try{ URL.revokeObjectURL(entry.preview)}catch{} })
        // نبقي الملفات لكن نحدث savedUrls
        setSavedUrls(finalUrls)
        // لا نفرغ files للحفاظ على امكانية اعادة التحميل، لكن نعلم أن المرفوعة أصبحت محفوظة
      }
      // بعد الحفظ أنشئ الملف الموحد تلقائياً
      await generateCombinedPdf(true)
    }catch(err){ alert('خطأ في الحفظ: '+err.message); console.error(err) }
    setSaving(false)
  }

  // دمج كل الوثائق + بيانات التوثيق في ملف PDF واحد
  async function generateCombinedPdf(isAfterSave=false) {
    if(!form.name && !form.deliveryNumber){ alert('أدخل الرقم والاسم أولاً'); return }
    setGenerating(true)
    try{
      // 1. إنشاء PDF موحد عبر pdf-lib
      const mergedPdf = await PDFDocument.create()

      // 2. صفحة الغلاف: بيانات التوثيق عبر html2canvas -> صورة -> تضمين في pdf-lib
      const input = docRef.current
      // انتظر الصور
      const imgs = input.querySelectorAll('img')
      await Promise.all(Array.from(imgs).map(img=> img.complete?Promise.resolve(): new Promise(res=>{img.onload=res; img.onerror=res; setTimeout(res,1500)})))
      await new Promise(r=> setTimeout(r, 300))
      const canvas = await html2canvas(input, { scale:2, useCORS:true, allowTaint:true, logging:false, backgroundColor:'#ffffff', imageTimeout:15000, onclone: (cd)=> cd.querySelectorAll('img').forEach(i=>{ i.crossOrigin='anonymous' }) })
      const coverDataUrl = canvas.toDataURL('image/jpeg', 0.88)
      const coverBytes = await fetch(coverDataUrl).then(r=> r.arrayBuffer())
      const coverImage = await mergedPdf.embedJpg(coverBytes)
      const coverDims = coverImage.scale(1)
      // اجعل صفحة A4 عمودية
      const a4Width = 595.28, a4Height = 841.89 // points
      let page = mergedPdf.addPage([a4Width, a4Height])
      // احسب مقاس الصورة لتناسب A4 مع هامش
      const margin = 20
      const maxW = a4Width - margin*2
      const maxH = a4Height - margin*2
      let imgW = maxW, imgH = (coverDims.height * maxW)/coverDims.width
      if(imgH > maxH){ imgH = maxH; imgW = (coverDims.width * maxH)/coverDims.height }
      const x = (a4Width - imgW)/2, y = a4Height - margin - imgH
      page.drawImage(coverImage, { x, y, width: imgW, height: imgH })

      // إذا كان طول الصورة أكبر من صفحة واحدة، html2canvas قد تنتجه طويل جداً - نقسمه عبر jsPDF سابقاً لكن pdf-lib بصفحة واحدة قد يقص. لذا إذا pdfHeight كبير، نقسم canvas إلى شرائح
      // تبسيط: إذا كان canvas طويل جداً (نسبة >1.5)، نستخدم jsPDF التقسيم ثم ندمجه عبر pdf-lib copy. للتبسيط نحتفظ بالصفحة الواحدة مع تصغير.
      // لكن للحفاظ على الجودة، إذا ارتفع كثيراً، نضيف صفحات إضافية من canvas المقسم (نستخدم نفس تقسيم jsPDF القديم)
      // سنقوم هنا إذا كان cover طويل جداً، نعيد التقسيم عبر jsPDF ثم نعيد دمجه - للتبسيط نتجاهل الآن ونضع صفحة واحدة مصغرة.

      // 3. أضف كل وثيقة مرفوعة كصفحات إضافية
      for(let i=0;i<files.length;i++){
        const entry = files[i]
        const f = entry.file
        if(entry.type==='image'){
          // اقرأ الصورة كـ bytes
          const buf = await f.arrayBuffer()
          let img
          try{
            // حاول jpg أولاً ثم png
            if(f.type==='image/png') img = await mergedPdf.embedPng(buf)
            else img = await mergedPdf.embedJpg(buf)
          }catch{
            // fallback: حولها عبر canvas إلى jpg
            const dataUrl = entry.preview || await new Promise(res=>{
              const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(f)
            })
            const jpgBuf = await fetch(dataUrl).then(r=>r.arrayBuffer()).catch(()=>null)
            if(jpgBuf) try{ img = await mergedPdf.embedJpg(jpgBuf) }catch{}
            if(!img) continue
          }
          const dims = img.scale(1)
          // صفحة A4 مع الحفاظ على النسبة
          const pg = mergedPdf.addPage([a4Width, a4Height])
          let w = maxW, h = (dims.height * maxW)/dims.width
          if(h>maxH){ h=maxH; w=(dims.width * maxH)/dims.height }
          pg.drawImage(img, { x:(a4Width-w)/2, y:(a4Height-h)/2, width:w, height:h })
          // عنوان صغير فوق الصورة
          pg.drawText(`وثيقة ${i+1}: ${entry.name}`, { x: margin, y: a4Height - 14, size: 8, color: { r:0.2,g:0.2,b:0.2 } })
        } else if(entry.type==='pdf'){
          const pdfBytes = await f.arrayBuffer()
          try{
            const srcPdf = await PDFDocument.load(pdfBytes)
            const copied = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
            copied.forEach(p=> mergedPdf.addPage(p))
          }catch(err){ console.error('pdf merge error', err); alert('فشل دمج PDF: '+entry.name) }
        } else {
          // ملف آخر (word etc) - نضيف صفحة نصية فيها اسم الملف
          const pg = mergedPdf.addPage([a4Width, a4Height])
          pg.drawText(`وثيقة ${i+1}: ${entry.name}`, { x: margin, y: a4Height - 40, size: 12 })
          pg.drawText(`نوع الملف: ${f.type || 'غير معروف'} - الحجم: ${(f.size/1024).toFixed(1)} KB`, { x: margin, y: a4Height - 60, size: 10 })
          pg.drawText(`تم ارفاق هذه الوثيقة مع التوثيق. افتح الملف الأصلي من النظام للمحتوى الكامل.`, { x: margin, y: a4Height - 80, size: 9 })
        }
      }

      // إذا لم يكن هناك ملفات لكن يوجد savedUrls (بعد الحفظ)، أضفها أيضاً (للصورة المحفوظة)
      if(files.length===0 && savedUrls.length>0){
        for(let i=0;i<savedUrls.length;i++){
          try{
            const url = savedUrls[i]
            const res = await fetch(url, { mode:'cors' })
            if(!res.ok) continue
            const buf = await res.arrayBuffer()
            const contentType = res.headers.get('content-type') || ''
            let img
            if(contentType.includes('png')) img = await mergedPdf.embedPng(buf)
            else img = await mergedPdf.embedJpg(buf)
            const dims = img.scale(1)
            const pg = mergedPdf.addPage([a4Width, a4Height])
            let w = maxW, h = (dims.height * maxW)/dims.width
            if(h>maxH){ h=maxH; w=(dims.width * maxH)/dims.height }
            pg.drawImage(img, { x:(a4Width-w)/2, y:(a4Height-h)/2, width:w, height:h })
          }catch{}
        }
      }

      const pdfBytes = await mergedPdf.save()
      const blob = new Blob([pdfBytes], { type:'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `توثيق_موحد_${form.name || form.deliveryNumber || 'وثيقة'}_${form.docDate}_${files.length}وثائق.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(()=> URL.revokeObjectURL(url), 2000)
      if(!isAfterSave) alert(`✓ تم إنشاء ملف موحد يحتوي على غلاف التوثيق + ${files.length} وثيقة (${savedUrls.length} محفوظة)`)
    }catch(err){ console.error(err); alert('فشل إنشاء الملف الموحد: '+err.message) }
    setGenerating(false)
  }

  // حفظ منفصل PDF سريع للغلاف فقط (للتوافق)
  async function generateCoverOnly(){
    await generateCombinedPdf(false)
  }

  const cardStyle = {background:'var(--card, rgba(255,255,255,0.85))', backdropFilter:'blur(8px)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:16, boxShadow:'0 4px 16px rgba(15,23,42,0.07)'}
  const labelStyle = {fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:6, display:'flex', alignItems:'center', gap:6}
  const inputStyle = {width:'100%', padding:'12px 14px', border:'2px solid #E2E8F0', borderRadius:12, background:'#F9FAFB', fontSize:'0.9rem', fontFamily:'inherit'}
  const hasFiles = files.length>0

  return (
    <div className="workdoc">
      <div className="page-title" style={{display:'flex', alignItems:'center', gap:10, marginBottom:16}}>
        <div className="title-icon" style={{width:40,height:40, background:'linear-gradient(135deg,#D4AF37,#B8942F)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center'}}>📋</div>
        <h2>توثيق - أرشفة هدية (متعدد الوثائق)</h2>
      </div>
      <p style={{fontSize:12, color:'#64748B', background:'white', padding:'8px 12px', borderRadius:8, border:'1px solid #E2E8F0', maxWidth:900, margin:'0 auto 16px', lineHeight:1.6}}>ارفع <b>أكثر من وثيقة</b> (صور + PDF) - كل وثيقة ستظهر في المعاينة وسيتم دمجها جميعاً مع غلاف التوثيق في <b>ملف PDF واحد موحد</b> عند الحفظ النهائي.</p>

      <div className="workdoc-layout" style={{display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap'}}>
        <div className="workdoc-form" style={{flex:'1 1 360px', minWidth:300, display:'flex', flexDirection:'column', gap:12}}>
          <div style={cardStyle}><span style={labelStyle}>الرقم (رقم القطع) * <span style={{flex:1,height:1, background:'linear-gradient(to left, rgba(212,175,55,0.25), transparent)', marginRight:8}}></span></span><input name="deliveryNumber" value={form.deliveryNumber} onChange={handleChange} placeholder="مثال: 001" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>التاريخ *</span><input type="date" name="docDate" value={form.docDate} onChange={handleChange} style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>الأسم *</span><input name="name" value={form.name} onChange={handleChange} placeholder="اسم الهدية / القطعة" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>النوع</span><input name="giftType" value={form.giftType} onChange={handleChange} placeholder="نوع الهدية" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>الوصف</span><textarea name="description" value={form.description} onChange={handleChange} placeholder="وصف تفصيلي للهدية" rows={3} style={{...inputStyle, resize:'vertical'}} /></div>
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

          {/* رفع وثائق متعددة */}
          <div style={cardStyle}>
            <span style={labelStyle}>رفع الوثائق (صور + PDF) - متعدد <span style={{background:'#FFFBEB', color:'#B8942F', fontSize:11, padding:'2px 8px', borderRadius:20, border:'1px solid rgba(212,175,55,0.3)'}}>{files.length} وثيقة</span></span>
            <div className="image-upload">
              <label className="image-label" style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, border:'2px dashed #E2E8F0', borderRadius:12, padding:'18px 12px', cursor:'pointer', background:'#F8FAFC', minHeight:90}}>
                <span style={{fontSize:22}}>📁</span>
                <span style={{fontSize:13, color:'#475569', fontWeight:600}}>اضغط لاختيار وثائق متعددة</span>
                <span style={{fontSize:11, color:'#94A3B8'}}>صور (JPG/PNG) + ملفات PDF - يمكنك اختيار أكثر من ملف دفعة واحدة</span>
                <input type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} hidden />
              </label>
              <div style={{display:'flex', gap:8, marginTop:8}}>
                <label style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px 8px', border:'1px solid #E2E8F0', borderRadius:10, background:'white', cursor:'pointer', fontSize:12}}>
                  📂 من الملفات <input type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} hidden />
                </label>
                <label style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px 8px', border:'1px solid #E2E8F0', borderRadius:10, background:'white', cursor:'pointer', fontSize:12}}>
                  📸 تصوير <input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} hidden />
                </label>
              </div>

              {files.length>0 ? (
                <div style={{marginTop:12, display:'flex', flexDirection:'column', gap:8, maxHeight:280, overflowY:'auto', paddingRight:4}}>
                  {files.map((entry, idx)=>(
                    <div key={idx} style={{display:'flex', gap:10, alignItems:'center', background:'white', border:'1px solid #E2E8F0', borderRadius:10, padding:8}}>
                      <div style={{width:56, height:56, borderRadius:8, overflow:'hidden', background:'#F8FAFC', border:'1px solid #E2E8F0', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                        {entry.type==='image' && entry.preview ? <img src={entry.preview} alt={entry.name} crossOrigin="anonymous" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : entry.type==='pdf' ? <span style={{fontSize:24}}>📄</span> : <span style={{fontSize:20}}>📃</span>}
                      </div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:12, fontWeight:600, color:'#0F172A', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{idx+1}. {entry.name}</div>
                        <div style={{fontSize:11, color:'#64748B'}}>{entry.type==='image'?'صورة': entry.type==='pdf'?'PDF':'وثيقة'} • {(entry.size/1024).toFixed(1)} KB</div>
                      </div>
                      <button type="button" onClick={()=> removeFile(idx)} style={{width:28, height:28, borderRadius:'50%', border:'none', background:'rgba(220,38,38,0.9)', color:'white', cursor:'pointer', flexShrink:0}}>×</button>
                    </div>
                  ))}
                </div>
              ) : <p style={{fontSize:12, color:'#94A3B8', textAlign:'center', marginTop:8}}>لم يتم رفع أي وثيقة بعد - يمكنك رفع أكثر من وثيقة وسيتم حفظها في ملف واحد</p>}
            </div>
          </div>

          {/* أزرار */}
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <button onClick={handleFinalSave} disabled={saving} style={{flex:'1 1 160px', padding:14, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', color:'white', border:'none', borderRadius:12, fontWeight:800, cursor:'pointer', opacity: saving?0.6:1}}>
              {saving ? 'جاري الحفظ والدمج...' : `💾 حفظ نهائي ودمج (${files.length} وثائق)`}
            </button>
            <button onClick={()=> generateCombinedPdf(false)} disabled={generating} style={{flex:'1 1 140px', padding:14, background:'linear-gradient(135deg,#D4AF37,#B8942F)', color:'#0F172A', border:'none', borderRadius:12, fontWeight:800, cursor:'pointer', opacity: generating?0.6:1}}>
              {generating ? 'جاري...' : '📥 تحميل الملف الموحد'}
            </button>
          </div>
          <p style={{fontSize:11, color:'#64748B', textAlign:'center', background:'#FFFBEB', padding:8, borderRadius:8, border:'1px solid rgba(212,175,55,0.2)', lineHeight:1.6}}>سيتم إنشاء <b>ملف PDF واحد</b> يحتوي على: غلاف التوثيق (الـ 9 حقول) + كل الوثائق المرفوعة (كل وثيقة في صفحاتها). الصور ستُدمج كصفحات، ملفات PDF سيتم نسخ صفحاتها مباشرة.</p>
        </div>

        {/* معاينة */}
        <div className="workdoc-preview-section" style={{flex:'1 1 380px', minWidth:300, position:'sticky', top:20}}>
          <div className="preview-header" style={{display:'flex', alignItems:'center', gap:8, fontWeight:700, color:'#475569', marginBottom:10}}><span className="preview-icon">👁</span><span>معاينة الغلاف + قائمة الوثائق ({files.length})</span></div>
          <div className="workdoc-preview" ref={docRef} style={{background:'white', borderRadius:16, border:'2px solid #E2E8F0', padding:20, boxShadow:'0 4px 16px rgba(15,23,42,0.07)'}}>
            <div className="doc-header" style={{textAlign:'center', borderBottom:'2px solid #D4AF37', paddingBottom:12, marginBottom:12}}><h2 style={{margin:0}}>وثيقة توثيق هدية</h2><p style={{margin:'4px 0 0', color:'#64748B', fontSize:12}}>التاريخ: {form.docDate || new Date().toLocaleDateString('ar-SA')} • الوثائق: {files.length}</p></div>
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
            <div className="doc-section" style={{marginTop:12}}><h3 style={{color:'#B8942F', borderRight:'3px solid #D4AF37', paddingRight:8, margin:'0 0 6px'}}>الوثائق المرفقة ({files.length})</h3>
              {files.length>0 ? (
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {files.map((entry, idx)=>(
                    <div key={idx} style={{display:'flex', gap:8, alignItems:'center', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:6}}>
                      <div style={{width:40, height:40, borderRadius:6, overflow:'hidden', background:'white', border:'1px solid #E2E8F0', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
                        {entry.type==='image' && entry.preview ? <img src={entry.preview} alt={entry.name} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span style={{fontSize:18}}>{entry.type==='pdf'?'📄':'📃'}</span>}
                      </div>
                      <div style={{flex:1, minWidth:0}}><div style={{fontSize:11, fontWeight:600}}>{idx+1}. {entry.name}</div><div style={{fontSize:10, color:'#64748B'}}>{entry.type}</div></div>
                    </div>
                  ))}
                  <p style={{fontSize:10, color:'#94A3B8', textAlign:'center', margin:'6px 0 0'}}>سيتم دمج هذه الوثائق كصفحات بعد الغلاف في الملف الموحد</p>
                </div>
              ) : <p style={{color:'#94A3B8', fontSize:12, textAlign:'center', background:'#F8FAFC', padding:14, borderRadius:8, border:'1px dashed #E2E8F0'}}>لا توجد وثائق - ارفع أكثر من وثيقة وسيتم حفظها في ملف واحد</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
