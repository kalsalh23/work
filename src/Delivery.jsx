import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function Delivery() {
  const [products, setProducts] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState('')

  // الحقول المطلوبة: الرقم, التاريخ, الاسم, النوع, الوصف, الجهة الرسمية, البلد المهدي, البلد المستلم, نوع الزيارة
  // الرقم = رقم القطع (الكمية)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [deliveryNumber, setDeliveryNumber] = useState('') // الرقم - رقم القطع
  const [quantity, setQuantity] = useState('') // عدد القطع = الرقم
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0,10)) // التاريخ
  const [recipientName, setRecipientName] = useState('') // الأسم
  const [giftType, setGiftType] = useState('') // النوع
  const [giftDesc, setGiftDesc] = useState('') // الوصف
  const [officialEntity, setOfficialEntity] = useState('') // الجهة الرسمية
  const [donorCountry, setDonorCountry] = useState('') // البلد المهدي
  const [recipientCountry, setRecipientCountry] = useState('') // البلد المستلم
  const [visitType, setVisitType] = useState('') // نوع الزيارة

  const [submitting, setSubmitting] = useState(false)

  useEffect(()=>{ load() }, [])

  async function load(){
    setLoading(true)
    const [pRes, dRes] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('created_at',{ascending:false}),
      supabase.from('deliveries').select('*, products(name, gift_type, donor_country)').order('created_at',{ascending:false}).limit(100)
    ])
    if(pRes.data) setProducts(pRes.data)
    if(dRes.data) setDeliveries(dRes.data)
    else if(dRes.error && dRes.error.message.includes('does not exist')) {
      setDeliveries([])
    }
    setLoading(false)
  }

  function onSelectProduct(id){
    setSelectedProduct(id)
    const prod = products.find(p=>String(p.id)===String(id))
    if(prod){
      setGiftType(prod.gift_type || prod.categories?.name || '')
      setGiftDesc(prod.gift_description || prod.details || '')
      setDonorCountry(prod.donor_country || '')
      // اقتراح رقم القطع = الكمية المتاحة
      if(!quantity) setQuantity('')
    }
  }

  async function handleDeliver(e){
    e.preventDefault()
    if(!selectedProduct || !quantity || !recipientName) { alert('أكمل الحقول المطلوبة: اختر القطعة، الرقم/الكمية، والاسم'); return }
    const prod = products.find(p=>String(p.id)===String(selectedProduct))
    if(!prod){ alert('المنتج غير موجود'); return }
    if(parseInt(quantity) > prod.quantity){ alert(`الكمية المطلوبة (${quantity}) أكبر من المخزون (${prod.quantity})`); return }
    setSubmitting(true)
    try{
      // محاولة RPC أولاً
      const { error: funcError } = await supabase.rpc('deliver_product', {
        p_product_id: parseInt(selectedProduct),
        p_quantity: parseInt(quantity),
        p_delivered_to: recipientName,
        p_delivery_date: deliveryDate,
        p_notes: `النوع:${giftType} | الوصف:${giftDesc} | الجهة:${officialEntity} | المهدي:${donorCountry} | المستلم:${recipientCountry} | الزيارة:${visitType} | رقم:${deliveryNumber}`
      })
      let inserted = !funcError
      if(funcError){
        const newQty = prod.quantity - parseInt(quantity)
        const { error: updErr } = await supabase.from('products').update({ quantity: newQty }).eq('id', prod.id)
        if(updErr) throw updErr

        // محاولة ادراج بكل الحقول الجديدة، مع fallback إذا الأعمدة غير موجودة
        const fullPayload = {
          product_id: prod.id,
          quantity_delivered: parseInt(quantity),
          delivered_to: recipientName,
          delivery_date: deliveryDate,
          recipient_entity: officialEntity || null,
          donor_country: donorCountry || null,
          recipient_country: recipientCountry || null,
          visit_type: visitType || null,
          gift_type: giftType || null,
          gift_description: giftDesc || null,
          delivery_number: deliveryNumber || null,
          notes: `الوصف:${giftDesc}`
        }
        let { error: insErr } = await supabase.from('deliveries').insert(fullPayload)
        if(insErr && (insErr.message.includes('column') || insErr.message.includes('schema cache'))){
          // fallback للسكيما القديمة
          const fallback = {
            product_id: prod.id,
            quantity_delivered: parseInt(quantity),
            delivered_to: recipientName,
            delivery_date: deliveryDate,
            recipient_entity: officialEntity || null,
            notes: `${giftDesc} | ${visitType} | ${recipientCountry}`
          }
          const { error: e2 } = await supabase.from('deliveries').insert(fallback)
          if(e2) {
            await supabase.from('products').update({ quantity: prod.quantity }).eq('id', prod.id)
            throw e2
          } else {
            inserted = true
            // تنبيه للمستخدم
            console.warn('تم الحفظ بالوضع المتوافق - شغّل migration الجديد للأعمدة الإضافية')
          }
        } else if(insErr){
          await supabase.from('products').update({ quantity: prod.quantity }).eq('id', prod.id)
          throw insErr
        } else {
          inserted = true
        }
      }
      if(inserted){
        setProducts(prev=> prev.map(p=> p.id===prod.id ? {...p, quantity: p.quantity - parseInt(quantity)} : p))
        // لا نفرغ كل الحقول، نفرغ الرقم والاسم فقط للسرعة
        setDeliveryNumber(''); setQuantity(''); // setRecipientName('') // يبقى للراحة
        const { data } = await supabase.from('deliveries').select('*, products(name)').order('created_at',{ascending:false}).limit(100)
        if(data) setDeliveries(data)
        alert('✓ تم التسليم بنجاح وتم خصم الكمية من المخزون')
      }
    }catch(err){
      alert('خطأ في التسليم: '+err.message + '\n تأكد من تشغيل supabase_gifts_migration.sql و supabase_delivery_update.sql')
    }
    setSubmitting(false)
  }

  const filteredDeliveries = filterDate ? deliveries.filter(d=> (d.delivery_date||'').slice(0,10)===filterDate) : deliveries

  const cardStyle = {background:'rgba(255,255,255,0.85)', backdropFilter:'blur(8px)', borderRadius:16, border:'1px solid rgba(255,255,255,0.25)', padding:16, boxShadow:'0 4px 16px rgba(15,23,42,0.07)', marginBottom:12}
  const inputStyle = {width:'100%', padding:'12px 14px', border:'2px solid #E2E8F0', borderRadius:12, background:'#F9FAFB', fontSize:'0.9rem'}
  const labelStyle = {fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:6, display:'flex', alignItems:'center', gap:6}

  return (
    <div className="delivery-page" style={{animation:'fadeSlideUp 0.4s ease-out'}}>
      <div className="page-title" style={{display:'flex', alignItems:'center', gap:10, marginBottom:16}}>
        <div className="title-icon" style={{width:40,height:40, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>🚚</div>
        <h2 style={{fontSize:'1.4rem', fontWeight:700}}>التسليم - صرف قطع</h2>
      </div>
      <p style={{fontSize:13, color:'#64748B', background:'white', padding:'8px 12px', borderRadius:8, border:'1px solid #E2E8F0', maxWidth:700, margin:'0 auto 16px'}}>أدخل بيانات التسليم: الرقم هو رقم/عدد القطع المراد تسليمها. الحقول مع * مطلوبة.</p>

      <form onSubmit={handleDeliver} style={{maxWidth:720, margin:'0 auto'}}>
        {/* اختيار القطعة */}
        <div style={cardStyle}>
          <span style={labelStyle}>اختر القطعة من المخزون *<span style={{flex:1,height:1, background:'linear-gradient(to left, rgba(212,175,55,0.25), transparent)', marginRight:8}}></span></span>
          <select value={selectedProduct} onChange={e=>onSelectProduct(e.target.value)} required style={{...inputStyle, background:'white'}}>
            <option value="">-- اختر هدية / قطعة --</option>
            {products.map(p=>(
              <option key={p.id} value={p.id}>{p.name} - متاح: {p.quantity} {p.gift_type?`(${p.gift_type})`:''} {p.donor_country?`- ${p.donor_country}`:''}</option>
            ))}
          </select>
          {selectedProduct && (()=>{const pr=products.find(x=>String(x.id)===String(selectedProduct)); return pr? <div style={{marginTop:8, fontSize:12, color:'#475569', background:'#F8FAFC', padding:8, borderRadius:8, lineHeight:1.6}}>المتاح: <b>{pr.quantity}</b> | النوع: {pr.gift_type||pr.categories?.name||'-'} | المهدي: {pr.donor_country||'-'} | الأرشفة: {pr.archive_date||pr.created_at?.slice(0,10)}</div>:null})()}
        </div>

        {/* الرقم + التاريخ + الاسم */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
          <div style={cardStyle}>
            <span style={labelStyle}>الرقم (رقم القطع) *</span>
            <input type="text" value={deliveryNumber} onChange={e=>setDeliveryNumber(e.target.value)} placeholder="مثال: 001" style={inputStyle} />
            <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} required placeholder="العدد *" style={{...inputStyle, marginTop:8}} />
            <span style={{fontSize:11, color:'#94A3B8'}}>العدد هو الكمية المخصومة</span>
          </div>
          <div style={cardStyle}>
            <span style={labelStyle}>التاريخ *</span>
            <input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)} required style={inputStyle} />
          </div>
          <div style={cardStyle}>
            <span style={labelStyle}>الأسم *</span>
            <input type="text" value={recipientName} onChange={e=>setRecipientName(e.target.value)} required placeholder="اسم المستلم" style={inputStyle} />
          </div>
        </div>

        {/* النوع + الوصف */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:12}}>
          <div style={cardStyle}>
            <span style={labelStyle}>النوع</span>
            <input type="text" value={giftType} onChange={e=>setGiftType(e.target.value)} placeholder="نوع الهدية/القطعة" style={inputStyle} />
            <select value={visitType} onChange={e=>setVisitType(e.target.value)} style={{...inputStyle, marginTop:8}}>
              <option value="">نوع الزيارة</option>
              <option value="رسمية">رسمية</option>
              <option value="ودية">ودية</option>
              <option value="بروتوكولية">بروتوكولية</option>
              <option value="عمل">عمل</option>
              <option value="تكريم">تكريم</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>
          <div style={cardStyle}>
            <span style={labelStyle}>الوصف</span>
            <textarea value={giftDesc} onChange={e=>setGiftDesc(e.target.value)} rows={4} placeholder="وصف الهدية/القطعة" style={{...inputStyle, resize:'vertical'}} />
          </div>
        </div>

        {/* الجهة الرسمية + البلد المهدي + البلد المستلم + نوع الزيارة */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
          <div style={cardStyle}>
            <span style={labelStyle}>الجهة الرسمية</span>
            <input type="text" value={officialEntity} onChange={e=>setOfficialEntity(e.target.value)} placeholder="مثال: وزارة الخارجية" style={inputStyle} />
          </div>
          <div style={cardStyle}>
            <span style={labelStyle}>البلد المهدي</span>
            <input type="text" value={donorCountry} onChange={e=>setDonorCountry(e.target.value)} placeholder="مثال: السعودية" style={inputStyle} />
          </div>
          <div style={cardStyle}>
            <span style={labelStyle}>البلد المستلم</span>
            <input type="text" value={recipientCountry} onChange={e=>setRecipientCountry(e.target.value)} placeholder="مثال: سوريا" style={inputStyle} />
          </div>
        </div>

        <button type="submit" disabled={submitting} style={{width:'100%', padding:14, background:'linear-gradient(135deg,#1E3A2B,#2D5A3E)', color:'white', border:'none', borderRadius:12, fontWeight:800, fontSize:'1rem', cursor:'pointer', opacity: submitting?0.6:1}}>
          {submitting? 'جاري التسليم...' : '✓ تأكيد التسليم وخصم من المخزون'}
        </button>
      </form>

      <div style={{marginTop:24, maxWidth:800, margin:'24px auto 0'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:8}}>
          <h3 style={{fontSize:'1.1rem', fontWeight:700}}>سجل التسليم</h3>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} style={{padding:'8px 12px', border:'2px solid #E2E8F0', borderRadius:8}} />
            {filterDate && <button onClick={()=>setFilterDate('')} style={{padding:'8px 12px', background:'#E2E8F0', border:'none', borderRadius:8, cursor:'pointer'}}>مسح</button>}
          </div>
        </div>
        {loading? <p style={{textAlign:'center', padding:20, color:'#475569'}}>جاري التحميل...</p> : filteredDeliveries.length===0? <p style={{textAlign:'center', padding:30, background:'white', borderRadius:12, border:'1px solid #E2E8F0', color:'#94A3B8'}}>لا يوجد سجل تسليم {filterDate && `في ${filterDate}`}</p> : (
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {filteredDeliveries.map(d=>(
              <div key={d.id} style={{background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:14}}>
                <div style={{display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6}}>
                  <div style={{fontWeight:700}}>{d.products?.name || `قطعة #${d.product_id}`} <span style={{color:'#D4AF37', fontSize:12}}>✓ {d.quantity_delivered} قطع {d.delivery_number?`[رقم:${d.delivery_number}]`:''}</span></div>
                  <div style={{fontSize:11, color:'#94A3B8'}}>{d.delivery_date} | {d.created_at?.slice(0,16).replace('T',' ')}</div>
                </div>
                <div style={{fontSize:12, color:'#475569', marginTop:6, lineHeight:1.7, background:'#F8FAFC', padding:8, borderRadius:8}}>
                  <div>الاسم: {d.delivered_to} | النوع: {d.gift_type||'-'} | الزيارة: {d.visit_type||'-'}</div>
                  <div>الجهة: {d.recipient_entity||'-'} | المهدي: {d.donor_country||'-'} → المستلم: {d.recipient_country||'-'}</div>
                  {(d.gift_description||d.notes) && <div>الوصف: {d.gift_description||d.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
