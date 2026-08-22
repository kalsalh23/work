import { useState, useRef } from 'react'
import { PDFDocument } from 'pdf-lib'
import html2canvas from 'html2canvas'
import { supabase } from './supabaseClient'

function getLocalDate(){
  const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10)
}
const emptyForm = {
  deliveryNumber: '',
  docDate: getLocalDate(),
  name: '',
  giftType: '',
  description: '',
  officialEntity: '',
  donorCountry: '',
  recipientCountry: '',
  visitType: '',
}

export default function WorkDoc() {
  const [form, setForm] = useState({...emptyForm})
  const [files, setFiles] = useState([]) // ملفات الوثيقة الحالية
  const [docs, setDocs] = useState([]) // [{id, form, files}]
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewRef = useRef(null)
  const formRef = useRef(null)

  function handleChange(e){ setForm(prev=> ({...prev, [e.target.name]: e.target.value})) }

  function handleFiles(e){
    const selected = Array.from(e.target.files)
    if(!selected.length) return
    const entries = selected.map(f=>{
      const isImage = f.type.startsWith('image/')
      const isPdf = f.type==='application/pdf'
      let preview = null
      if(isImage) preview = URL.createObjectURL(f)
      return { file:f, preview, type: isPdf?'pdf': isImage?'image':'other', name:f.name, size:f.size }
    })
    setFiles(prev=> [...prev, ...entries])
    e.target.value=''
  }
  function removeFile(idx){
    setFiles(prev=>{
      const ent = prev[idx]
      if(ent?.preview) try{ URL.revokeObjectURL(ent.preview)}catch{}
      return prev.filter((_,i)=>i!==idx)
    })
  }

  function handleAddAnother(){
    if(!form.name && !form.deliveryNumber){
      alert('أدخل على الأقل الرقم والاسم قبل إضافة وثيقة أخرى')
      return
    }
    const id = Date.now().toString(36)+Math.random().toString(36).slice(2,6)
    // نسخ الملفات مع previews
    const docFiles = files.map(entry=> ({...entry}))
    setDocs(prev=> [...prev, { id, form:{...form}, files: docFiles }])
    // تفريغ النموذج للوثيقة التالية
    setForm({...emptyForm, docDate: getLocalDate()})
    setFiles([])
    // scroll للفورم
    setTimeout(()=> formRef.current?.scrollIntoView({behavior:'smooth', block:'start'}), 100)
  }

  function removeDoc(idx){
    setDocs(prev=>{
      const d = prev[idx]
      d.files.forEach(entry=> { if(entry.preview) try{ URL.revokeObjectURL(entry.preview)}catch{} })
      return prev.filter((_,i)=>i!==idx)
    })
  }
  function editDoc(idx){
    const d = docs[idx]
    // أعد الوثيقة للتحرير: احذفها من القائمة وأعدها للفورم
    setForm({...d.form})
    setFiles(d.files)
    setDocs(prev=> prev.filter((_,i)=>i!==idx))
    formRef.current?.scrollIntoView({behavior:'smooth'})
  }

  async function compressImage(file){
    return new Promise(res=>{
      const reader=new FileReader(); reader.readAsDataURL(file)
      reader.onload=e=>{
        const img=new Image(); img.src=e.target.result
        img.onload=()=>{
          const canvas=document.createElement('canvas'); const MAX=1400
          let {width,height}=img; if(width>MAX||height>MAX){ if(width>height){height=(height/width)*MAX;width=MAX}else{width=(width/height)*MAX;height=MAX} }
          canvas.width=width; canvas.height=height; const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,width,height)
          canvas.toBlob(blob=>{
            const cf=new File([blob], file.name.replace(/\.[^.]+$/,'.jpg'), {type:'image/jpeg'})
            res(cf)
          },'image/jpeg',0.75)
        }; img.onerror=()=>res(file)
      }; reader.onerror=()=>res(file)
    })
  }

  async function uploadFilesForDoc(docFiles){
    const urls=[]
    for(const entry of docFiles){
      let f = entry.file
      if(entry.type==='image') f = await compressImage(entry.file)
      const fname=`${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name.replace(/[^a-zA-Z0-9.-]/g,'_')}`
      const {error} = await supabase.storage.from('product-images').upload(fname, f)
      if(error){ console.error(error); continue }
      const {data}=supabase.storage.from('product-images').getPublicUrl(fname)
      if(data?.publicUrl) urls.push(data.publicUrl)
    }
    return urls
  }

  async function handleSaveAll(){
    // اجمع كل الوثائق: القائمة + الحالية إذا فيها بيانات
    let allDocs = [...docs]
    const hasCurrent = form.name || form.deliveryNumber || files.length>0 || form.giftType || form.description
    if(hasCurrent){
      if(!form.name){ alert('الوثيقة الحالية تحتاج اسم - أدخله أو اضغط وثيقة أخرى لإضافتها'); return }
      allDocs = [...allDocs, { id:'current', form:{...form}, files:[...files] }]
    }
    if(allDocs.length===0){ alert('لا توجد وثائق للحفظ - أضف وثيقة أولاً'); return }
    setSaving(true)
    try{
      // حفظ كل وثيقة في DB
      let savedCount=0
      for(const doc of allDocs){
        const urls = await uploadFilesForDoc(doc.files)
        const qty = parseInt(doc.form.deliveryNumber)||1
        const payload = {
          name: doc.form.name,
          quantity: isNaN(qty)?1:qty,
          images: urls,
          details: doc.form.description||null,
          gift_type: doc.form.giftType||null,
          gift_description: doc.form.description||null,
          archive_date: doc.form.docDate|| getLocalDate(),
          received_date: doc.form.docDate||null,
          delivery_date: doc.form.docDate||null,
          donor_country: doc.form.donorCountry||null,
          occasion: doc.form.visitType||null,
          recipient_country: doc.form.recipientCountry||null,
          official_entity: doc.form.officialEntity||null,
          visit_type: doc.form.visitType||null,
          delivery_number: doc.form.deliveryNumber||null,
        }
        let {error}=await supabase.from('products').insert(payload)
        if(error && (error.message.includes('column')||error.message.includes('schema cache'))){
          const fallbackDetails=`الرقم:${doc.form.deliveryNumber} | النوع:${doc.form.giftType} | الجهة:${doc.form.officialEntity} | المهدي:${doc.form.donorCountry} | المستلم:${doc.form.recipientCountry} | الزيارة:${doc.form.visitType} | الوصف:${doc.form.description}`
          const fallback={ name:payload.name, quantity:payload.quantity, images:payload.images, details:fallbackDetails, gift_type:payload.gift_type, gift_description:payload.gift_description, archive_date:payload.archive_date, donor_country:payload.donor_country, occasion:payload.occasion }
          const {error:e2}=await supabase.from('products').insert(fallback)
          if(e2) throw e2
        } else if(error) throw error
        savedCount++
      }
      alert(`✓ تم حفظ ${savedCount} وثيقة بنجاح - سيتم الآن إنشاء الملف الموحد`)
      await generateCombinedPdf(allDocs)
      // بعد الحفظ الناجح: افرغ القائمة والحالية
      // حرر previews
      allDocs.forEach(d=> d.files.forEach(entry=> { if(entry.preview) try{ URL.revokeObjectURL(entry.preview)}catch{} }))
      files.forEach(entry=> { if(entry.preview) try{ URL.revokeObjectURL(entry.preview)}catch{} })
      setDocs([])
      setFiles([])
      setForm({...emptyForm, docDate: getLocalDate()})
    }catch(err){ alert('خطأ في الحفظ: '+err.message); console.error(err) }
    setSaving(false)
  }

  async function generateCombinedPdf(externalDocs=null){
    // externalDocs = مصفوفة وثائق للدمج، إذا null استخدم docs + current
    let allDocs = externalDocs
    if(!allDocs){
      allDocs=[...docs]
      const hasCurrent = form.name || form.deliveryNumber || files.length>0
      if(hasCurrent) allDocs.push({ id:'current', form:{...form}, files:[...files] })
    }
    if(allDocs.length===0){ alert('لا توجد وثائق للتحميل - أضف وثيقة أولاً'); return }
    setGenerating(true)
    try{
      const merged = await PDFDocument.create()
      const a4W=595.28, a4H=841.89, margin=20, maxW=a4W-margin*2, maxH=a4H-margin*2

      // دالة مساعدة لإضافة غلاف وثيقة كصورة
      async function addCoverForDoc(doc, index){
        // أنشئ عنصر مؤقت للغلاف لالتقاطه
        const tempDiv = document.createElement('div')
        tempDiv.style.position='absolute'; tempDiv.style.left='-9999px'; tempDiv.style.top='0'; tempDiv.style.width='700px'; tempDiv.style.background='white'; tempDiv.style.padding='20px'; tempDiv.style.fontFamily='sans-serif'; tempDiv.dir='rtl'
        tempDiv.innerHTML = `
          <div style="text-align:center; border-bottom:2px solid #D4AF37; padding-bottom:12px; margin-bottom:12px">
            <h2 style="margin:0; color:#0F172A">وثيقة ${index+1} - توثيق هدية</h2>
            <p style="margin:4px 0 0; color:#64748B; font-size:12px">التاريخ: ${doc.form.docDate || ''} • الرقم: ${doc.form.deliveryNumber || '-'}</p>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:13px">
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0; width:30%">الرقم (رقم القطع)</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.deliveryNumber||'-'}</td></tr>
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0">التاريخ</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.docDate||'-'}</td></tr>
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0">الأسم</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.name||'-'}</td></tr>
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0">النوع</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.giftType||'-'}</td></tr>
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0">الجهة الرسمية</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.officialEntity||'-'}</td></tr>
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0">البلد المهدي</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.donorCountry||'-'}</td></tr>
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0">البلد المستلم</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.recipientCountry||'-'}</td></tr>
            <tr><td style="font-weight:700; background:#F8FAFC; padding:8px 10px; border:1px solid #E2E8F0">نوع الزيارة</td><td style="padding:8px 10px; border:1px solid #E2E8F0">${doc.form.visitType||'-'}</td></tr>
          </table>
          <div style="margin-top:12px"><h3 style="color:#B8942F; border-right:3px solid #D4AF37; padding-right:8; margin:0 0 6px; font-size:14px">الوصف</h3><p style="margin:0; white-space:pre-wrap; color:#475569; font-size:13px">${(doc.form.description||'-').replace(/</g,'&lt;')}</p></div>
          <div style="margin-top:8px; font-size:11px; color:#94A3B8; textAlign:center">وثيقة ${index+1} من ${allDocs.length} • المرفقات: ${doc.files.length} وثيقة</div>
        `
        document.body.appendChild(tempDiv)
        // انتظر قليلاً للرسم
        await new Promise(r=> setTimeout(r, 100))
        const canvas = await html2canvas(tempDiv, { scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false })
        document.body.removeChild(tempDiv)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        const bytes = await fetch(dataUrl).then(r=> r.arrayBuffer())
        const img = await merged.embedJpg(bytes)
        const dims = img.scale(1)
        const pg = merged.addPage([a4W, a4H])
        let w=maxW, h=(dims.height*maxW)/dims.width
        if(h>maxH){ h=maxH; w=(dims.width*maxH)/dims.height }
        pg.drawImage(img, { x:(a4W-w)/2, y:a4H-margin-h, width:w, height:h })
      }

      // أضف غلاف لكل وثيقة ثم مرفقاتها
      for(let i=0;i<allDocs.length;i++){
        const doc = allDocs[i]
        await addCoverForDoc(doc, i)
        // مرفقات هذه الوثيقة
        for(let j=0;j<doc.files.length;j++){
          const entry = doc.files[j]
          const f = entry.file
          if(entry.type==='image'){
            try{
              const buf = await f.arrayBuffer()
              let img
              try{ img = f.type==='image/png' ? await merged.embedPng(buf) : await merged.embedJpg(buf) }catch{
                // fallback عبر preview
                const dataUrl = entry.preview || await new Promise(res=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(f) })
                const b2 = await fetch(dataUrl).then(r=>r.arrayBuffer())
                img = await merged.embedJpg(b2)
              }
              const d = img.scale(1)
              const pg = merged.addPage([a4W,a4H])
              let w=maxW, h=(d.height*maxW)/d.width
              if(h>maxH){ h=maxH; w=(d.width*maxH)/d.height }
              pg.drawImage(img,{ x:(a4W-w)/2, y:(a4H-h)/2, width:w, height:h })
              // تذييل
              pg.drawText(`وثيقة ${i+1} - مرفق ${j+1}: ${entry.name}`, { x:margin, y:14, size:7, color:{r:0.4,g:0.4,b:0.4} })
            }catch(err){ console.error(err) }
          } else if(entry.type==='pdf'){
            try{
              const bytes = await f.arrayBuffer()
              const src = await PDFDocument.load(bytes)
              const pages = await merged.copyPages(src, src.getPageIndices())
              pages.forEach(p=> merged.addPage(p))
            }catch(err){ console.error('pdf merge',err) }
          } else {
            const pg = merged.addPage([a4W,a4H])
            pg.drawText(`وثيقة ${i+1} - مرفق ${j+1}: ${entry.name}`, {x:margin, y:a4H-40, size:11})
            pg.drawText(`النوع: ${f.type||'غير معروف'} - الحجم: ${(f.size/1024).toFixed(1)} KB`, {x:margin, y:a4H-60, size:10})
          }
        }
      }

      const pdfBytes = await merged.save()
      const blob = new Blob([pdfBytes], {type:'application/pdf'})
      const url = URL.createObjectURL(blob)
      const a=document.createElement('a'); a.href=url; a.download=`توثيق_موحد_${allDocs.length}وثائق_${new Date().toISOString().slice(0,10)}.pdf`; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(()=> URL.revokeObjectURL(url),2000)
      if(!externalDocs) alert(`✓ تم إنشاء ملف موحد يضم ${allDocs.length} وثيقة مع جميع مرفقاتها`)
    }catch(err){ console.error(err); alert('فشل إنشاء الملف: '+err.message) }
    setGenerating(false)
  }

  const cardStyle = {background:'rgba(255,255,255,0.85)', backdropFilter:'blur(8px)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:16, boxShadow:'0 4px 16px rgba(15,23,42,0.07)'}
  const labelStyle = {fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:6, display:'flex', alignItems:'center', gap:6}
  const inputStyle = {width:'100%', padding:'12px 14px', border:'2px solid #E2E8F0', borderRadius:12, background:'#F9FAFB', fontSize:'0.9rem', fontFamily:'inherit'}

  const totalDocs = docs.length + (form.name||files.length?1:0)

  return (
    <div className="workdoc">
      <div className="page-title" style={{display:'flex', alignItems:'center', gap:10, marginBottom:12}} ref={formRef}>
        <div className="title-icon" style={{width:40,height:40, background:'linear-gradient(135deg,#D4AF37,#B8942F)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center'}}>📋</div>
        <h2>توثيق - أرشفة هدايا (وثائق متعددة)</h2>
        <span style={{marginRight:'auto', background:'#0F172A', color:'white', fontSize:12, padding:'6px 12px', borderRadius:20}}>{docs.length} وثيقة مضافة</span>
      </div>
      <p style={{fontSize:12, color:'#64748B', background:'white', padding:'8px 12px', borderRadius:8, border:'1px solid #E2E8F0', maxWidth:900, margin:'0 auto 12px'}}>املأ حقول الوثيقة ثم اضغط <b>➕ وثيقة أخرى</b> لتضاف للمعاينة. كرر حتى تنتهي، ثم اضغط <b>💾 حفظ الملف الموحد</b> ليتم حفظ جميع الوثائق في ملف PDF واحد.</p>

      <div className="workdoc-layout" style={{display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap'}}>
        <div className="workdoc-form" style={{flex:'1 1 360px', minWidth:300, display:'flex', flexDirection:'column', gap:10}}>
          <div style={{...cardStyle, border:'2px solid #D4AF37', background:'#FFFBEB'}}><span style={{fontSize:13, fontWeight:700, color:'#92400E'}}>📝 تحرير الوثيقة {docs.length+1}</span><span style={{fontSize:11, color:'#92400E', marginRight:8}}>{docs.length>0 ? `(تمت إضافة ${docs.length} وثيقة)` : '(الوثيقة الأولى)'}</span></div>
          <div style={cardStyle}><span style={labelStyle}>الرقم (رقم القطع) *</span><input name="deliveryNumber" value={form.deliveryNumber} onChange={handleChange} placeholder="مثال: 001" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>التاريخ *</span><input type="date" name="docDate" value={form.docDate} onChange={handleChange} onFocus={e=> e.target.showPicker && e.target.showPicker()} style={{...inputStyle, minHeight:48}} lang="ar" /></div>
          <div style={cardStyle}><span style={labelStyle}>الأسم *</span><input name="name" value={form.name} onChange={handleChange} placeholder="اسم الهدية / القطعة" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>النوع</span><input name="giftType" value={form.giftType} onChange={handleChange} placeholder="نوع الهدية" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>الوصف</span><textarea name="description" value={form.description} onChange={handleChange} placeholder="وصف تفصيلي" rows={3} style={{...inputStyle, resize:'vertical'}} /></div>
          <div style={cardStyle}><span style={labelStyle}>الجهة الرسمية</span><input name="officialEntity" value={form.officialEntity} onChange={handleChange} placeholder="مثال: وزارة الخارجية" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>البلد المهدي</span><input name="donorCountry" value={form.donorCountry} onChange={handleChange} placeholder="مثال: السعودية" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>البلد المستلم</span><input name="recipientCountry" value={form.recipientCountry} onChange={handleChange} placeholder="مثال: سوريا" style={inputStyle} /></div>
          <div style={cardStyle}><span style={labelStyle}>نوع الزيارة</span>
            <select name="visitType" value={form.visitType} onChange={handleChange} style={inputStyle}>
              <option value="">اختر نوع الزيارة</option>
              <option value="رسمية">رسمية</option><option value="ودية">ودية</option><option value="بروتوكولية">بروتوكولية</option><option value="عمل">عمل</option><option value="تكريم">تكريم</option><option value="أخرى">أخرى</option>
            </select>
          </div>

          {/* رفع وثائق هذه الوثيقة */}
          <div style={cardStyle}>
            <span style={labelStyle}>وثائق هذه الوثيقة ({files.length})</span>
            <label style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6, border:'2px dashed #E2E8F0', borderRadius:12, padding:'14px 10px', cursor:'pointer', background:'#F8FAFC'}}>
              <span style={{fontSize:18}}>📁</span><span style={{fontSize:12, fontWeight:600, color:'#475569'}}>اختر وثائق لهذه الوثيقة</span><span style={{fontSize:10, color:'#94A3B8'}}>صور + PDF - متعدد</span>
              <input type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} hidden />
            </label>
            <div style={{display:'flex', gap:6, marginTop:8}}>
              <label style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'8px 6px', border:'1px solid #E2E8F0', borderRadius:8, background:'white', cursor:'pointer', fontSize:11}}>📂 ملفات<input type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} hidden /></label>
              <label style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'8px 6px', border:'1px solid #E2E8F0', borderRadius:8, background:'white', cursor:'pointer', fontSize:11}}>📸 تصوير<input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} hidden /></label>
            </div>
            {files.length>0 && (
              <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:6, maxHeight:180, overflowY:'auto'}}>
                {files.map((entry, idx)=>(
                  <div key={idx} style={{display:'flex', gap:8, alignItems:'center', background:'white', border:'1px solid #E2E8F0', borderRadius:8, padding:6}}>
                    <div style={{width:44, height:44, borderRadius:6, overflow:'hidden', background:'#F8FAFC', border:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      {entry.type==='image' && entry.preview ? <img src={entry.preview} alt={entry.name} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span style={{fontSize:18}}>{entry.type==='pdf'?'📄':'📃'}</span>}
                    </div>
                    <div style={{flex:1, minWidth:0}}><div style={{fontSize:11, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{entry.name}</div><div style={{fontSize:10, color:'#64748B'}}>{entry.type} • {(entry.size/1024).toFixed(1)}KB</div></div>
                    <button type="button" onClick={()=> removeFile(idx)} style={{width:26, height:26, borderRadius:'50%', border:'none', background:'rgba(220,38,38,0.9)', color:'white', cursor:'pointer'}}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* زر وثيقة أخرى + حفظ */}
          <button onClick={handleAddAnother} type="button" style={{width:'100%', padding:13, background:'linear-gradient(135deg,#D4AF37,#B8942F)', color:'#0F172A', border:'none', borderRadius:12, fontWeight:800, cursor:'pointer', fontSize:'0.95rem'}}>
            ➕ وثيقة أخرى  {docs.length>0?`(${docs.length} مضافة)` : ''}
          </button>
          <p style={{fontSize:11, color:'#64748B', textAlign:'center', margin:0}}>اضغط وثيقة أخرى ليتم إضافة الحقول الحالية للمعاينة وتبدأ وثيقة جديدة</p>

          <div style={{display:'flex', gap:8}}>
            <button onClick={handleSaveAll} disabled={saving} style={{flex:2, padding:14, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', color:'white', border:'none', borderRadius:12, fontWeight:800, cursor:'pointer', opacity: saving?0.6:1}}>
              {saving? 'جاري الحفظ...' : `💾 حفظ الملف الموحد (${totalDocs} وثيقة)`}
            </button>
            <button onClick={()=> generateCombinedPdf(null)} disabled={generating} style={{flex:1, padding:14, background:'white', color:'#0F172A', border:'2px solid #E2E8F0', borderRadius:12, fontWeight:700, cursor:'pointer'}}>
              {generating? '...' : '📥 معاينة PDF'}
            </button>
          </div>
        </div>

        {/* معاينة مجمعة */}
        <div ref={previewRef} style={{flex:'1 1 380px', minWidth:300, position:'sticky', top:20}}>
          <div style={{display:'flex', alignItems:'center', gap:8, fontWeight:700, color:'#475569', marginBottom:10, background:'white', padding:'8px 12px', borderRadius:10, border:'1px solid #E2E8F0'}}>
            <span>👁</span><span>المعاينة - {docs.length} وثيقة مضافة + مسودة</span>
            {docs.length>0 && <button onClick={()=> { if(confirm('مسح كل الوثائق؟')){ docs.forEach(d=> d.files.forEach(e=> e.preview && URL.revokeObjectURL(e.preview))); setDocs([]) } }} style={{marginRight:'auto', fontSize:11, padding:'4px 8px', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:6, cursor:'pointer'}}>مسح الكل</button>}
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            {docs.map((doc, idx)=>(
              <div key={doc.id} style={{background:'white', borderRadius:16, border:'2px solid #D4AF37', padding:16, boxShadow:'0 4px 16px rgba(15,23,42,0.07)', position:'relative'}}>
                <div style={{position:'absolute', top:-10, right:12, background:'#0F172A', color:'white', fontSize:11, padding:'2px 8px', borderRadius:20}}>وثيقة {idx+1}</div>
                <div style={{display:'flex', gap:6, marginBottom:8, marginTop:4}}>
                  <button onClick={()=> editDoc(idx)} style={{fontSize:11, padding:'4px 8px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:6, cursor:'pointer'}}>✎ تعديل</button>
                  <button onClick={()=> removeDoc(idx)} style={{fontSize:11, padding:'4px 8px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, cursor:'pointer', color:'#DC2626'}}>🗑 حذف</button>
                  <span style={{marginRight:'auto', fontSize:11, color:'#64748B'}}>{doc.form.docDate} • {doc.files.length} مرفق</span>
                </div>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}><tbody>
                  <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0', width:'32%'}}>الرقم</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{doc.form.deliveryNumber||'-'}</td></tr>
                  <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0'}}>الأسم</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{doc.form.name||'-'}</td></tr>
                  <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0'}}>النوع</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{doc.form.giftType||'-'}</td></tr>
                  <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0'}}>الجهة</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{doc.form.officialEntity||'-'}</td></tr>
                  <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0'}}>المهدي → المستلم</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{doc.form.donorCountry||'-'} → {doc.form.recipientCountry||'-'}</td></tr>
                  <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0'}}>الزيارة</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{doc.form.visitType||'-'}</td></tr>
                </tbody></table>
                {doc.form.description && <div style={{marginTop:8, background:'#F8FAFC', padding:8, borderRadius:8, border:'1px solid #E2E8F0', fontSize:12}}><b>الوصف:</b> {doc.form.description}</div>}
                {doc.files.length>0 && <div style={{marginTop:8, display:'flex', gap:6, flexWrap:'wrap'}}>{doc.files.map((entry,i)=>(
                  <div key={i} style={{width:56, height:56, borderRadius:8, overflow:'hidden', border:'1px solid #E2E8F0', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center'}}>
                    {entry.type==='image' && entry.preview ? <img src={entry.preview} alt={entry.name} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span>{entry.type==='pdf'?'📄':'📃'}</span>}
                  </div>
                ))}</div>}
              </div>
            ))}

            {/* مسودة حالية */}
            <div style={{background: (form.name||files.length)?'white':'#F8FAFC', borderRadius:16, border: (form.name||files.length)?'2px dashed #D4AF37':'1px dashed #CBD5E1', padding:16, opacity: (form.name||files.length)?1:0.7}}>
              <div style={{fontSize:12, fontWeight:700, color: (form.name||files.length)?'#B8942F':'#94A3B8', marginBottom:8}}>{docs.length===0?'الوثيقة 1 (الحالية)':`الوثيقة ${docs.length+1} (مسودة)`} {form.name? `- ${form.name}` : ' - املأ الحقول ثم اضغط وثيقة أخرى'}</div>
              {(form.name||form.deliveryNumber||files.length>0) ? (
                <>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}><tbody>
                    <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0', width:'32%'}}>الرقم</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{form.deliveryNumber||'-'}</td></tr>
                    <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0'}}>الأسم</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{form.name||'-'}</td></tr>
                    <tr><td style={{fontWeight:700, background:'#F8FAFC', padding:'6px 8px', border:'1px solid #E2E8F0'}}>النوع</td><td style={{padding:'6px 8px', border:'1px solid #E2E8F0'}}>{form.giftType||'-'}</td></tr>
                  </tbody></table>
                  {files.length>0 && <div style={{marginTop:8, display:'flex', gap:6, flexWrap:'wrap'}}>{files.map((entry,i)=>(<div key={i} style={{width:48, height:48, borderRadius:8, overflow:'hidden', border:'1px solid #E2E8F0', background:'white', display:'flex', alignItems:'center', justifyContent:'center'}}>{entry.type==='image'&&entry.preview?<img src={entry.preview} alt={entry.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<span style={{fontSize:16}}>{entry.type==='pdf'?'📄':'📃'}</span>}</div>))}</div>}
                </>
              ) : <p style={{fontSize:12, color:'#94A3B8', textAlign:'center', margin:0}}>املأ الحقول أعلاه ثم اضغط "وثيقة أخرى" لتضاف هنا</p>}
            </div>

            {docs.length===0 && !form.name && <p style={{fontSize:12, color:'#94A3B8', textAlign:'center', background:'white', padding:20, borderRadius:12, border:'1px dashed #E2E8F0'}}>المعاينة فارغة - ابدأ بإضافة وثيقة</p>}
          </div>
        </div>
      </div>

      {/* عنصر مخفي للطباعة القديم - لم يعد مستخدم لكن نبقيه للتوافق */}
      <div style={{position:'absolute', left:-9999, top:-9999, width:700, background:'white', padding:20}} ref={useRef(null)}></div>
    </div>
  )
}
