import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, AlignmentType, HeadingLevel } from 'docx'
import { saveAs } from 'file-saver'

export default function Products({ onUpdate }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [filterCat, setFilterCat] = useState('all')
  const [filterDate, setFilterDate] = useState('')
  const [filterField, setFilterField] = useState('archive_date')
  const [loading, setLoading] = useState(true)
  const [editProduct, setEditProduct] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [lightbox, setLightbox] = useState(null)
  const [exporting, setExporting] = useState(false)
  const tableRef = useRef(null)

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
    if (!confirm('هل أنت متأكد من حذف هذه الهدية؟')) return
    const product = products.find((p) => p.id === id)
    if (product?.images && product.images.length > 0) {
      const fileNames = product.images.map((url) => url.split('/').pop())
      await supabase.storage.from('product-images').remove(fileNames)
    }
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (!error) setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  function startEdit(product) {
    setEditProduct(product.id)
    setEditForm({
      name: product.name || '',
      quantity: product.quantity || '',
      category_id: product.category_id || '',
      gift_type: product.gift_type || product.categories?.name || '',
      gift_description: product.gift_description || product.details || '',
      archive_date: product.archive_date || (product.created_at ? product.created_at.slice(0,10) : ''),
      received_date: product.received_date || '',
      delivery_date: product.delivery_date || '',
      donor_country: product.donor_country || '',
      estimated_price: product.estimated_price || '',
      occasion: product.occasion || '',
    })
  }

  function cancelEdit() { setEditProduct(null) }

  async function saveEdit(id) {
    const payload = {
      name: editForm.name,
      quantity: parseInt(editForm.quantity),
      category_id: editForm.category_id || null,
      details: editForm.gift_description || null,
      gift_type: editForm.gift_type || null,
      gift_description: editForm.gift_description || null,
      archive_date: editForm.archive_date || null,
      received_date: editForm.received_date || null,
      delivery_date: editForm.delivery_date || null,
      donor_country: editForm.donor_country || null,
      estimated_price: editForm.estimated_price ? parseFloat(editForm.estimated_price) : null,
      occasion: editForm.occasion || null,
    }
    const { error } = await supabase.from('products').update(payload).eq('id', id)
    if (!error) {
      setProducts((prev) => prev.map((p) => p.id === id ? { ...p, ...payload, categories: categories.find(c=>String(c.id)===String(payload.category_id)) || p.categories } : p))
      setEditProduct(null)
    } else {
      // fallback for old schema
      const fallback = { name: payload.name, quantity: payload.quantity, category_id: payload.category_id, details: payload.details }
      const { error: e2 } = await supabase.from('products').update(fallback).eq('id', id)
      if (!e2) {
        setProducts((prev) => prev.map((p) => p.id === id ? { ...p, ...fallback } : p))
        setEditProduct(null)
        alert('تم الحفظ (وضع متوافق) - شغّل ملف supabase_gifts_migration.sql لإضافة الحقول الجديدة')
      } else alert('خطأ: ' + error.message)
    }
  }

  const imagesOf = (product) => {
    if (!product.images) return []
    if (typeof product.images === 'string') { try { return JSON.parse(product.images) } catch { return [] } }
    return product.images || []
  }

  // فلترة حسب الصنف + حسب اليوم
  const filtered = products.filter(p => {
    if (filterCat !== 'all' && String(p.category_id) !== filterCat) return false
    if (filterDate) {
      let fieldVal = p[filterField]
      if (filterField === 'created_at') fieldVal = p.created_at ? p.created_at.slice(0,10) : ''
      else fieldVal = p[filterField] || ''
      // مقارنة YYYY-MM-DD
      if (String(fieldVal).slice(0,10) !== filterDate) return false
    }
    return true
  })

  // تصدير PDF - جدول يومي
  async function exportPDF() {
    if (filtered.length === 0) { alert('لا توجد بيانات للتصدير'); return }
    setExporting(true)
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const title = `تقرير الهدايا - ${filterDate ? filterDate : 'كل الأيام'}`
      // عنوان
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(16)
      pdf.text(title.split('').reverse().join(''), 297/2, 12, { align: 'center' })
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      const subtitle = `التاريخ: ${new Date().toLocaleDateString('ar-EG')} - العدد: ${filtered.length}`
      pdf.text(subtitle.split('').reverse().join(''), 297/2, 18, { align: 'center' })

      // جدول مبسط: نرسم header + صفوف
      const headers = ['م','اسم الهدية','النوع','العدد','الأرشفة','الاستلام','التسليم','البلد المهدي','السعر','المناسبة']
      const colW = [10, 40, 30, 15, 25, 25, 25, 30, 25, 40]
      const startX = 10
      let y = 25
      const rowH = 8
      // header
      pdf.setFillColor(15,23,42)
      pdf.setTextColor(255,255,255)
      pdf.setFontSize(7)
      let x = startX
      headers.forEach((h,i)=>{
        pdf.rect(x, y, colW[i], rowH, 'F')
        pdf.text(h.split('').reverse().join(''), x+colW[i]/2, y+5, { align:'center' })
        x+=colW[i]
      })
      y+=rowH
      pdf.setTextColor(0,0,0)
      pdf.setFont('helvetica','normal')
      // rows
      filtered.forEach((p, idx)=>{
        if (y > 195) { pdf.addPage(); y=12 }
        const cells = [
          String(idx+1),
          (p.name||'').slice(0,22),
          (p.gift_type||p.categories?.name||'').slice(0,15),
          String(p.quantity||''),
          (p.archive_date||'').slice(0,10),
          (p.received_date||'').slice(0,10),
          (p.delivery_date||'').slice(0,10),
          (p.donor_country||'').slice(0,15),
          p.estimated_price? String(p.estimated_price) : '',
          (p.occasion||'').slice(0,18),
        ]
        const bg = idx%2===0 ? 245 : 255
        pdf.setFillColor(bg,bg,bg)
        x = startX
        cells.forEach((c,i)=>{
          pdf.rect(x, y, colW[i], rowH, 'F')
          pdf.rect(x, y, colW[i], rowH)
          const txt = String(c).split('').reverse().join('')
          // للعربية نحاول وسط
          pdf.text(txt, x+colW[i]/2, y+5, { align:'center' })
          x+=colW[i]
        })
        y+=rowH
      })
      // ملخص
      y+=4
      pdf.setFontSize(8)
      const totalQty = filtered.reduce((s,p)=> s + (parseInt(p.quantity)||0), 0)
      const sumPrice = filtered.reduce((s,p)=> s + (parseFloat(p.estimated_price)||0), 0)
      pdf.text(`اجمالي الهدايا: ${filtered.length} - اجمالي القطع: ${totalQty} - اجمالي السعر التقريبي: ${sumPrice}`.split('').reverse().join(''), 287, y, { align:'right' })

      const fileName = `هدايا_${filterDate || 'الكل'}_${new Date().toISOString().slice(0,10)}.pdf`
      pdf.save(fileName)
    } catch(err){ alert('فشل PDF: '+err.message)}
    setExporting(false)
  }

  // تصدير Word
  async function exportWord() {
    if (filtered.length === 0) { alert('لا توجد بيانات للتصدير'); return }
    setExporting(true)
    try {
      const headerRow = new TableRow({
        children: ['م','اسم الهدية','نوع الهدية','العدد','تاريخ الأرشفة','تاريخ الاستلام','تاريخ التسليم','البلد المهدي','السعر التقريبي','المناسبة الرسمية','الوصف'].map(t=> new TableCell({
          children:[new Paragraph({ children:[new TextRun({text:t, bold:true, size:18})], alignment: AlignmentType.CENTER })],
          shading:{ fill:'0F172A', color:'auto' },
        }))
      })
      const rows = filtered.map((p,i)=> new TableRow({
        children: [
          String(i+1),
          p.name||'',
          p.gift_type||p.categories?.name||'',
          String(p.quantity||''),
          p.archive_date||'',
          p.received_date||'',
          p.delivery_date||'',
          p.donor_country||'',
          p.estimated_price? String(p.estimated_price):'',
          p.occasion||'',
          (p.gift_description||p.details||'').slice(0,60),
        ].map(t=> new TableCell({ children:[new Paragraph({ children:[new TextRun({text:String(t), size:16})], alignment: AlignmentType.CENTER })] }))
      }))
      const table = new Table({
        rows: [headerRow, ...rows],
        width:{ size:100, type: WidthType.PERCENTAGE },
        borders:{ top:{style:'single', size:1}, bottom:{style:'single', size:1}, left:{style:'single', size:1}, right:{style:'single', size:1}, insideH:{style:'single', size:1}, insideV:{style:'single', size:1}},
      })
      const doc = new Document({
        sections:[{
          properties:{ page:{ margin:{ top:600, bottom:600, left:600, right:600 }} },
          children:[
            new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children:[new TextRun({text:`تقرير الهدايا - ${filterDate || 'كل الأيام'}`, bold:true, size:28})] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children:[new TextRun({text:`التاريخ: ${new Date().toLocaleDateString('ar-EG')} - العدد: ${filtered.length}`, size:18, color:'475569'})], spacing:{after:300} }),
            table,
            new Paragraph({ spacing:{before:300}, children:[new TextRun({text:`إجمالي الهدايا: ${filtered.length} | إجمالي القطع: ${filtered.reduce((s,p)=>s+(parseInt(p.quantity)||0),0)} | إجمالي السعر: ${filtered.reduce((s,p)=>s+(parseFloat(p.estimated_price)||0),0)}`, size:18, bold:true})] }),
          ]
        }]
      })
      const blob = await Packer.toBlob(doc)
      saveAs(blob, `هدايا_${filterDate || 'الكل'}_${new Date().toISOString().slice(0,10)}.docx`)
    } catch(err){ alert('فشل Word: '+err.message)}
    setExporting(false)
  }

  return (
    <div className="products-page">
      <div className="page-title">
        <div className="title-icon">📦</div>
        <h2>المنتجات / الهدايا</h2>
      </div>

      <div className="filter-bar" style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'end'}}>
        <div style={{flex:1, minWidth:140}}>
          <label style={{fontSize:12, color:'#475569', display:'block', marginBottom:4}}>فلترة الصنف</label>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="all">كل الاصناف</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div style={{flex:1, minWidth:140}}>
          <label style={{fontSize:12, color:'#475569', display:'block', marginBottom:4}}>حقل التاريخ</label>
          <select value={filterField} onChange={e=>setFilterField(e.target.value)}>
            <option value="archive_date">تاريخ الأرشفة</option>
            <option value="received_date">تاريخ الاستلام</option>
            <option value="delivery_date">تاريخ التسليم</option>
            <option value="created_at">تاريخ الإنشاء</option>
          </select>
        </div>
        <div style={{flex:1, minWidth:150}}>
          <label style={{fontSize:12, color:'#475569', display:'block', marginBottom:4}}>فلترة حسب اليوم</label>
          <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} style={{width:'100%', padding:'12px 16px', border:'2px solid #E2E8F0', borderRadius:12, background:'white'}} />
        </div>
        {filterDate && <button onClick={()=>setFilterDate('')} style={{padding:'12px 14px', background:'#E2E8F0', border:'none', borderRadius:12, cursor:'pointer'}}>مسح</button>}
      </div>

      {/* أزرار التصدير */}
      <div style={{display:'flex', gap:10, margin:'14px 0', flexWrap:'wrap'}}>
        <button onClick={exportPDF} disabled={exporting} className="pdf-btn" style={{flex:1, marginTop:0, background: filterDate ? 'linear-gradient(135deg,#D4AF37,#B8942F)' : '#94A3B8'}}>
          {exporting ? 'جاري...' : `📄 تصدير PDF ${filterDate ? `(${filterDate})` : `(${filtered.length})`}`}
        </button>
        <button onClick={exportWord} disabled={exporting} style={{flex:1, padding:'14px', background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', color:'white', border:'none', borderRadius:12, fontWeight:800, cursor:'pointer'}}>
          {exporting ? 'جاري...' : `📝 تصدير Word ${filterDate ? `(${filterDate})` : `(${filtered.length})`}`}
        </button>
      </div>
      <div style={{fontSize:12, color:'#475569', marginBottom:10, background:'white', padding:'8px 12px', borderRadius:8, border:'1px solid #E2E8F0'}}>
        النتيجة: <b>{filtered.length}</b> هدية {filterDate && `في يوم ${filterDate}`} • إجمالي القطع: <b>{filtered.reduce((s,p)=>s+(parseInt(p.quantity)||0),0)}</b>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /><p>جاري التحميل...</p></div>
      ) : filtered.length === 0 ? (
        <p className="empty">لا توجد هدايا مطابقة للفلترة</p>
      ) : (
        <div className="products-grid" ref={tableRef}>
          {filtered.map((product) => (
            <div key={product.id} className="product-card">
              <div className="product-image">
                {imagesOf(product).length > 0 ? (
                  <img src={imagesOf(product)[0]} alt={product.name} onClick={() => setLightbox({ product, index: 0 })} />
                ) : (
                  <div className="no-image"><span className="no-img-icon">🎁</span>لا توجد صورة</div>
                )}
                {imagesOf(product).length > 1 && <span className="image-count">+{imagesOf(product).length - 1}</span>}
              </div>
              <div className="product-info">
                {editProduct === product.id ? (
                  <>
                    <input value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} placeholder="اسم الهدية" />
                    <div style={{display:'flex', gap:6}}><input type="number" value={editForm.quantity} onChange={e=>setEditForm({...editForm,quantity:e.target.value})} placeholder="العدد" style={{flex:1}} /><input value={editForm.gift_type} onChange={e=>setEditForm({...editForm,gift_type:e.target.value})} placeholder="نوع الهدية" style={{flex:1}} /></div>
                    <select value={editForm.category_id} onChange={e=>setEditForm({...editForm,category_id:e.target.value})}>
                      <option value="">بدون صنف</option>
                      {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                    </select>
                    <textarea value={editForm.gift_description} onChange={e=>setEditForm({...editForm,gift_description:e.target.value})} placeholder="وصف الهدية" rows={2} />
                    <div style={{display:'flex', gap:6}}><input type="date" value={editForm.archive_date} onChange={e=>setEditForm({...editForm,archive_date:e.target.value})} title="تاريخ الأرشفة" style={{flex:1}} /><input type="date" value={editForm.received_date} onChange={e=>setEditForm({...editForm,received_date:e.target.value})} title="تاريخ الاستلام" style={{flex:1}} /><input type="date" value={editForm.delivery_date} onChange={e=>setEditForm({...editForm,delivery_date:e.target.value})} title="تاريخ التسليم" style={{flex:1}} /></div>
                    <div style={{display:'flex', gap:6}}><input value={editForm.donor_country} onChange={e=>setEditForm({...editForm,donor_country:e.target.value})} placeholder="البلد المهدي" style={{flex:1}} /><input type="number" step="0.01" value={editForm.estimated_price} onChange={e=>setEditForm({...editForm,estimated_price:e.target.value})} placeholder="السعر التقريبي" style={{flex:1}} /></div>
                    <input value={editForm.occasion} onChange={e=>setEditForm({...editForm,occasion:e.target.value})} placeholder="المناسبة الرسمية" />
                    <div className="edit-actions">
                      <button className="save-btn" onClick={() => saveEdit(product.id)}>حفظ</button>
                      <button className="cancel-btn" onClick={cancelEdit}>إلغاء</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="category-badge">{product.gift_type || product.categories?.name || 'غير مصنف'}</span>
                    <h3>{product.name}</h3>
                    <div className="product-meta" style={{flexWrap:'wrap'}}>
                      <span>📦 {product.quantity} قطع</span>
                      {product.donor_country && <span>🌍 {product.donor_country}</span>}
                      {product.estimated_price && <span>💰 {product.estimated_price}</span>}
                    </div>
                    <div style={{fontSize:12, color:'#475569', lineHeight:1.7, background:'#F8FAFC', padding:'8px', borderRadius:8, marginTop:6}}>
                      <div><b>الأرشفة:</b> {product.archive_date || (product.created_at?product.created_at.slice(0,10):'-')} | <b>الاستلام:</b> {product.received_date || '-'}</div>
                      <div><b>التسليم:</b> {product.delivery_date || '-'} | <b>المناسبة:</b> {product.occasion || '-'}</div>
                      {product.gift_description && <div><b>الوصف:</b> {product.gift_description}</div>}
                      {!product.gift_description && product.details && <div><b>الوصف:</b> {product.details}</div>}
                    </div>
                    <div className="product-actions">
                      <button className="edit-btn" onClick={() => startEdit(product)}>✎ تعديل</button>
                      <button className="delete-btn" onClick={() => handleDelete(product.id)}>🗑 حذف</button>
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
            <img src={imagesOf(lightbox.product)[lightbox.index]} alt={lightbox.product.name} />
            {imagesOf(lightbox.product).length > 1 && (
              <div className="lightbox-nav">
                <button onClick={() => setLightbox((prev) => ({ ...prev, index: prev.index === 0 ? imagesOf(prev.product).length - 1 : prev.index - 1 }))}>&#10094;</button>
                <span>{lightbox.index + 1} / {imagesOf(lightbox.product).length}</span>
                <button onClick={() => setLightbox((prev) => ({ ...prev, index: prev.index === imagesOf(prev.product).length - 1 ? 0 : prev.index + 1 }))}>&#10095;</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
