import { useState, useCallback } from 'react'
import useBarcodeDetector from './useBarcodeDetector'

export default function BarcodeScannerModal({ onScan, onClose }) {
  const [error, setError] = useState('')

  const handleScan = useCallback((codes) => {
    if (codes.length > 0) {
      onScan(codes[0].rawValue)
    }
  }, [onScan])

  const handleError = useCallback((e) => {
    if (e.name === 'NotAllowedError' || e.message?.includes('permission')) {
      setError('permission_denied')
    } else {
      setError('unknown')
    }
  }, [])

  const { videoRef } = useBarcodeDetector({
    onScan: handleScan,
    onError: handleError,
    active: true,
  })

  return (
    <div className="scanner-overlay" onClick={onClose}>
      <div className="scanner-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="scanner-close" onClick={onClose}>&times;</button>
        <p className="scanner-hint">وجّه الكاميرا نحو الباركود</p>
        {error ? (
          <div className="scanner-error-inline">
            <p>{
              error === 'permission_denied'
                ? 'تم رفض الإذن بالكاميرا. يمكنك كتابة الباركود يدوياً.'
                : 'تعذر فتح الكاميرا. يرجى المحاولة مرة أخرى.'
            }</p>
          </div>
        ) : (
          <div className="scanner-video-container">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
            />
          </div>
        )}
      </div>
    </div>
  )
}