import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { supabase } from './supabaseClient'

export default function BarcodeScanner() {
  const [state, setState] = useState('scanning')
  const [product, setProduct] = useState(null)
  const [error, setError] = useState('')
  const scannerRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    startScanner()
    return () => stopScanner()
  }, [])

  function startScanner() {
    const scanner = new Html5Qrcode('barcode-scanner-page', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.PDF_417,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.MAXICODE,
        Html5QrcodeSupportedFormats.RSS_14,
        Html5QrcodeSupportedFormats.RSS_EXPANDED,
        Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
      ],
      useBarCodeDetectorIfSupported: true,
    })
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 120 } },
      (decodedText) => {
        scanner.stop().catch(() => {})
        findProduct(decodedText)
      },
      () => {}
    ).catch((err) => {
      const msg = String(err)
      if (msg.includes('NotAllowedError')) {
        setError('permission_denied')
      } else if (msg.includes('NotFoundError')) {
        setError('no_camera')
      } else {
        setError('unknown')
      }
    })
  }

  function stopScanner() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
  }

  async function findProduct(code) {
    setState('loading')
    playSound('scan')

    const { data } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('barcode', code)
      .maybeSingle()

    if (data) {
      setProduct(data)
      setState('found')
      playSound('success')
    } else {
      setState('not_found')
      playSound('error')
    }
  }

  function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.value = 0.15

      if (type === 'scan') {
        osc.frequency.value = 1200
        osc.type = 'sine'
        osc.start()
        osc.stop(ctx.currentTime + 0.1)
      } else if (type === 'success') {
        osc.frequency.value = 880
        osc.type = 'sine'
        osc.start()
        osc.stop(ctx.currentTime + 0.15)
      } else {
        osc.frequency.value = 300
        osc.type = 'square'
        osc.start()
        osc.stop(ctx.currentTime + 0.3)
      }
    } catch {}
  }

  function resetScanner() {
    setState('scanning')
    setProduct(null)
    setError('')
    setTimeout(startScanner, 300)
  }

  const images = (p) => {
    if (!p.images) return []
    if (typeof p.images === 'string') {
      try { return JSON.parse(p.images) } catch { return [] }
    }
    return p.images || []
  }

  if (error) {
    return (
      <div className="scanner-page">
        <div className="scanner-error">
          {error === 'permission_denied' && (
            <>
              <p>تم رفض الإذن بالكاميرا.</p>
              <p className="scanner-sub">يرجى السماح بالوصول إلى الكاميرا من إعدادات المتصفح.</p>
            </>
          )}
          {error === 'no_camera' && (
            <>
              <p>لا توجد كاميرا متاحة.</p>
              <p className="scanner-sub">هذه الميزة تتطلب كاميرا.</p>
            </>
          )}
          {error === 'unknown' && (
            <>
              <p>تعذر فتح الكاميرا.</p>
              <p className="scanner-sub">يرجى التأكد من اتصال الكاميرا والمحاولة مرة أخرى.</p>
            </>
          )}
          <button className="scan-retry-btn" onClick={resetScanner}>إعادة المحاولة</button>
        </div>
      </div>
    )
  }

  return (
    <div className="scanner-page">
      {state === 'scanning' && (
        <div className="scanner-active">
          <div className="scanner-frame">
            <div className="scanner-frame-corner tl" />
            <div className="scanner-frame-corner tr" />
            <div className="scanner-frame-corner bl" />
            <div className="scanner-frame-corner br" />
          </div>
          <p className="scanner-instruction">وجّه الكاميرا نحو الباركود</p>
          <div id="barcode-scanner-page" className="scanner-view-wrap" ref={containerRef} />
        </div>
      )}

      {state === 'loading' && (
        <div className="scanner-loading">
          <div className="scanner-spinner" />
          <p>جاري البحث عن المنتج...</p>
        </div>
      )}

      {state === 'found' && product && (
        <div className="scanner-result">
          <div className="scanner-result-card">
            {images(product).length > 0 && (
              <img
                src={images(product)[0]}
                alt={product.name}
                className="scanner-result-img"
              />
            )}
            <div className="scanner-result-info">
              <h3>{product.name}</h3>
              <p><span>الكمية:</span> {product.quantity}</p>
              <p><span>الصنف:</span> {product.categories?.name}</p>
              <p><span>الباركود:</span> {product.barcode}</p>
              {product.details && <p className="scanner-result-details">{product.details}</p>}
            </div>
          </div>
          <button className="scan-again-btn" onClick={resetScanner}>مسح منتج آخر</button>
        </div>
      )}

      {state === 'not_found' && (
        <div className="scanner-not-found">
          <p>هذا الباركود غير موجود في قاعدة البيانات.</p>
          <button className="scan-retry-btn" onClick={resetScanner}>إعادة المسح</button>
        </div>
      )}
    </div>
  )
}