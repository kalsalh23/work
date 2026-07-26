import { useState, useRef, useCallback } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { supabase } from './supabaseClient'

export default function BarcodeScanner() {
  const [scanResult, setScanResult] = useState(null) // null | { type: 'found', product } | { type: 'not_found', code }
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(true)
  const scannerRef = useRef(null)

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
    if (!scanning || codes.length === 0) return
    const code = codes[0].rawValue
    setScanning(false)

    setLoading(true)
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
  }, [scanning])

  function resetScanner() {
    setScanResult(null)
    setError('')
    setScanning(true)
  }

  return (
    <div className="scanner-page">
      <h2>📷 مسح منتج بالباركود</h2>

      {error ? (
        <div className="scanner-error">
          <p>{
            error === 'permission_denied'
              ? '⛔ تم رفض الإذن بالكاميرا.'
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
              <p>العدد: {scanResult.product.quantity}</p>
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
          <div className="scanner-view">
            <Scanner
              ref={scannerRef}
              onScan={handleScan}
              onError={(e) => {
                if (e.name === 'NotAllowedError') {
                  setError('permission_denied')
                } else {
                  setError('unknown')
                }
              }}
              formats={[
                'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
                'code_39', 'code_93', 'code_128', 'codabar', 'itf',
                'data_matrix', 'aztec', 'pdf_417',
              ]}
              sound={false}
              constraints={{ facingMode: 'environment' }}
            />
          </div>
          <p className="scanner-instruction">وجّه الكاميرا نحو الباركود</p>
        </div>
      )}
    </div>
  )
}