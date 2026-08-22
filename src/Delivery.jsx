import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Delivery() {
  const [products, setProducts] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState('')

  // form
  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState('')
  const [deliveredTo, setDeliveredTo] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0,10))
  const [recipientEntity, setRecipientEntity] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    const [pRes, dRes] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('created_at',{ascending:false}),
      supabase.from('deliveries').select('*, products(name)').order('created_at',{ascending:false}).limit(100)
    ])
    if(pRes.data) setProducts(pRes.data)
    if(dRes.data) setDeliveries(dRes.data)
    else if(dRes.error && dRes.error.message.includes('does not exist')) {
      // table not yet created
      setDeliveries([])
    }
    setLoading(false)
  }

  async function handleDeliver(e){
    e.preventDefault()
    if(!selectedProduct || !quantity || !deliveredTo) { alert('أكمل الحقول المطلوبة'); return }
    const prod = products.find(p=>String(p.id)===String(selectedProduct))
    if(!prod){ alert('المنتج غير موجود'); return }
    if(parseInt(quantity) > prod.quantity){ alert(`الكمية المطلوبة (${quantity}) أكبر من المخزون (${prod.quantity})`); return }
    setSubmitting(true)
    try{
      // 1) محاولة استخدام الدالة deliver_product إن وجدت
      // fallback: تحديث يدوي + إدراج
      const { data: funcData, error: funcError } = await supabase.rpc('deliver_product', {
        p_product_id: parseInt(selectedProduct),
        p_quantity: parseInt(quantity),
        p_delivered_to: deliveredTo,
        p_delivery_date: deliveryDate,
        p_notes: notes || null
      })
      if(funcError){
        // fallback manual
        const newQty = prod.quantity - parseInt(quantity)
        const { error: updErr } = await supabase.from('products').update({ quantity: newQty }).eq('id', prod.id)
        if(updErr) throw updErr
        const { error: insErr } = await supabase.from('deliveries').insert({
          product_id: prod.id,
          quantity_delivered: parseInt(quantity),
          delivered_to: deliveredTo,
          delivery_date: deliveryDate,
          recipient_entity: recipientEntity || null,
          notes: notes || null
        })
        if(insErr) {
          // revert
          await supabase.from('products').update({ quantity: prod.quantity }).eq('id', prod.id)
          throw insErr
        }
      }
      // تحديث محلي
      setProducts(prev=> prev.map(p=> p.id===prod.id ? {...p, quantity: p.quantity - parseInt(quantity)} : p))
      setQuantity(''); setDeliveredTo(''); setRecipientEntity(''); setNotes('')
      // reload deliveries
      const { data } = await supabase.from('deliveries').select('*, products(name)').order('created_at',{ascending:false}).limit(100)
      if(data) setDeliveries(data)
      alert('✓ تم التسليم بنجاح وتم خصم الكمية من المخزون')
    }catch(err){
      alert('خطأ في التسليم: '+err.message + '\n تأكد من تشغيل supabase_gifts_migration.sql')
    }
    setSubmitting(false)
  }

  const filteredDeliveries = filterDate ? deliveries.filter(d=> (d.delivery_date||'').slice(0,10)===filterDate) : deliveries

  return (
    <div className="delivery-page" style={{animation:'fadeSlideUp 0.4s ease-out'}}>
      <div className="page-title" style={{display:'flex', alignItems:'center', gap:10, marginBottom:20}}>
        <div className="title-icon" style={{width:40,height:40, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>🚚</div>
        <h2 style={{fontSize:'1.4rem', fontWeight:700}}>التسليم - صرف هدايا</h2>
      </div>

      <form onSubmit={handleDeliver} style={{maxWidth:600, margin:'0 auto'}}>
        <div className="form-card" style={{background:'rgba(255,255,255,0.85)', backdropFilter:'blur(8px)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:20, boxShadow:'0 4px 16px rgba(15,23,42,0.07)', marginBottom:16}}>
          <span className="card-label" style={{fontSize:'0.85rem', fontWeight:600, color:'#475569', marginBottom:8, display:'flex', alignItems:'center', gap:6}}>اختر الهدية من المخزون *<span style={{flex:1,height:1, background:'linear-gradient(to left, rgba(212,175,55,0.25), transparent)', marginRight:8}}></span></span>
          <select value={selectedProduct} onChange={e=>setSelectedProduct(e.target.value)} required style={{width:'100%', padding:'14px 16px', border:'2px solid #E2E8F0', borderRadius:12, background:'#F9FAFB'}}>
            <option value="">-- اختر هدية --</option>
            {products.map(p=>(
              <option key={p.id} value={p.id}>{p.name} - متاح: {p.quantity} {p.gift_type?`(${p.gift_type})`:''}</option>
            ))}
          </select>
          {selectedProduct && (()=>{const pr=products.find(x=>String(x.id)===String(selectedProduct)); return pr? <div style={{marginTop:8, fontSize:12, color:'#475569', background:'#F8FAFC', padding:8, borderRadius:8}}>الصنف: {pr.gift_type||pr.categories?.name||'-'} | الأرشفة: {pr.archive_date||pr.created_at?.slice(0,10)} | البلد: {pr.donor_country||'-'} | المخزون: <b>{pr.quantity}</b></div>:null})()}
        </div>

        <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
          <div className="form-card" style={{flex:1, minWidth:140, background:'rgba(255,255,255,0.85)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:20}}>
            <span className="card-label" style={{fontSize:'0.85rem', fontWeight:600, color:'#475569', marginBottom:8, display:'block'}}>الكمية المراد تسليمها *</span>
            <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} required placeholder="عدد القطع" style={{width:'100%', padding:'14px 16px', border:'2px solid #E2E8F0', borderRadius:12}} />
          </div>
          <div className="form-card" style={{flex:1, minWidth:140, background:'rgba(255,255,255,0.85)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:20}}>
            <span className="card-label" style={{fontSize:'0.85rem', fontWeight:600, color:'#475569', marginBottom:8, display:'block'}}>تاريخ التسليم *</span>
            <input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)} required style={{width:'100%', padding:'14px 16px', border:'2px solid #E2E8F0', borderRadius:12}} />
          </div>
        </div>

        <div className="form-card" style={{background:'rgba(255,255,255,0.85)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:20, marginTop:16}}>
          <span className="card-label" style={{fontSize:'0.85rem', fontWeight:600, color:'#475569', marginBottom:8, display:'block'}}>الجهة المستلمة / الشخص *</span>
          <input type="text" value={deliveredTo} onChange={e=>setDeliveredTo(e.target.value)} required placeholder="اسم الشخص أو الجهة المستلمة" style={{width:'100%', padding:'14px 16px', border:'2px solid #E2E8F0', borderRadius:12, marginBottom:10}} />
          <input type="text" value={recipientEntity} onChange={e=>setRecipientEntity(e.target.value)} placeholder="الجهة الرسمية (اختياري) - مثال: وزارة الخارجية" style={{width:'100%', padding:'14px 16px', border:'2px solid #E2E8F0', borderRadius:12}} />
        </div>

        <div className="form-card" style={{background:'rgba(255,255,255,0.85)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:20, marginTop:16}}>
          <span className="card-label" style={{fontSize:'0.85rem', fontWeight:600, color:'#475569', marginBottom:8, display:'block'}}>ملاحظات</span>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="ملاحظات إضافية (اختياري)" style={{width:'100%', padding:'14px 16px', border:'2px solid #E2E8F0', borderRadius:12}} />
        </div>

        <button type="submit" disabled={submitting} style={{width:'100%', padding:14, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', color:'white', border:'none', borderRadius:12, fontWeight:800, fontSize:'1rem', cursor:'pointer', marginTop:16, opacity: submitting?0.6:1}}>
          {submitting? 'جاري التسليم...' : '✓ تأكيد التسليم وخصم من المخزون'}
        </button>
      </form>

      <div style={{marginTop:24, maxWidth:800, margin:'24px auto 0'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <h3 style={{fontSize:'1.1rem', fontWeight:700}}>سجل التسليم</h3>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} style={{padding:'8px 12px', border:'2px solid #E2E8F0', borderRadius:8}} />
            {filterDate && <button onClick={()=>setFilterDate('')} style={{padding:'8px 12px', background:'#E2E8F0', border:'none', borderRadius:8, cursor:'pointer'}}>مسح</button>}
          </div>
        </div>
        {loading? <p style={{textAlign:'center', padding:20, color:'#475569'}}>جاري التحميل...</p> : filteredDeliveries.length===0? <p style={{textAlign:'center', padding:30, background:'white', borderRadius:12, border:'1px solid #E2E8F0', color:'#94A3B8'}}>لا يوجد سجل تسليم {filterDate && `في ${filterDate}`}</p> : (
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {filteredDeliveries.map(d=>(
              <div key={d.id} style={{background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:14, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:10}}>
                <div>
                  <div style={{fontWeight:700}}>{d.products?.name || `منتج #${d.product_id}`} <span style={{color:'#D4AF37', fontSize:12}}>✓ {d.quantity_delivered} قطع</span></div>
                  <div style={{fontSize:12, color:'#475569'}}>إلى: {d.delivered_to} {d.recipient_entity? `(${d.recipient_entity})`:''} • {d.delivery_date}</div>
                  {d.notes && <div style={{fontSize:12, color:'#94A3B8'}}>{d.notes}</div>}
                </div>
                <div style={{fontSize:11, color:'#94A3B8', textAlign:'left'}}>{d.created_at?.slice(0,16).replace('T',' ')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
