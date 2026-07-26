import { useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import useBarcodeDetector from './useBarcodeDetector'

export default function BarcodeScanner() {
  const [scanResult, setScanResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(true)

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 1200
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } catch (_) {}
  }

  function playErrorBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 300
      osc.type = 'square'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch (_) {}
  }

  const handleScan = useCallback(async (codes) => {
    if (codes.length === 0) return
    setActive(false)
    setLoading(true)

    const code = codes[0].rawValue
    const { data, error: dbError } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', code)
      .maybeSingle()

    setLoading(false)

    if (dbError) {
      setScanResult({ type: 'error' })
      return
    }

    if (data) {
      setScanResult({ type: 'found', product: data })
      playBeep()
    } else {
      setScanResult({ type: 'not_found', code })
      playErrorBeep()
    }
  }, [])

  const handleError = useCallback((e) => {
    if (e.name === 'NotAllowedError' || e.message?.includes('permission')) {
      setError('permission_denied')
    } else if (e.name === 'NotFoundError') {
      setError('no_camera')
    } else {
      setError('unknown')
    }
  }, [])

  const { videoRef } = useBarcodeDetector({
    onScan: handleScan,
    onError: handleError,
    active,
  })

  function resetScanner() {
    setScanResult(null)
    setError('')
    setActive(true)
  }

  return (
    <div className="scanner-page">
      <div className="page-title">
        <div className="title-icon">📷</div>
        <h2>مسح منتج بالباركود</h2>
      </div>

      {error ? (
        <div className="scanner-error">
          <p>{
            error === 'permission_denied'
              ? '⛔ تم رفض الإذن بالكاميرا.'
              : error === 'no_camera'
              ? '📷 لا توجد كاميرا متاحة.'
              : '⚠️ تعذر فتح الكاميرا.'
          }</p>
          <button onClick={resetScanner}>إعادة المحاولة</button>
        </div>
      ) : scanResult ? (
        <div className="scan-result">
          {scanResult.type === 'found' ? (
            <div className="scan-result-card">
              <h3>✅ تم العثور على المنتج!</h3>
              {scanResult.product.images?.length > 0 && (
                <img src={scanResult.product.images[0]} alt={scanResult.product.name} />
              )}
              <p><strong>{scanResult.product.name}</strong></p>
              <p>📦 {scanResult.product.quantity}</p>
              {scanResult.product.details && <p>{scanResult.product.details}</p>}
            </div>
          ) : scanResult.type === 'not_found' ? (
            <div className="scan-result-notfound">
              <h3>❌ لم يتم العثور على منتج</h3>
              <p>الباركود: <strong dir="ltr">{scanResult.code}</strong></p>
              <p>يمكنك اضافة هذا المنتج من صفحة اضافة منتج.</p>
            </div>
          ) : (
            <div className="scan-result-error">
              <h3>⚠️ خطأ في البحث</h3>
            </div>
          )}
          <button onClick={resetScanner}>مسح منتج آخر</button>
        </div>
      ) : loading ? (
        <div className="scanner-loading">
          <div className="spinner" />
          <p>جاري البحث عن المنتج...</p>
        </div>
      ) : (
        <div className="scanner-view-wrapper">
          <div className="scanner-video-container">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
            />
          </div>
          <p className="scanner-instruction">وجّه الكاميرا نحو الباركود</p>
        </div>
      )}
    </div>
  )
}