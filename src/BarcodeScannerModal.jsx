import { useState } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'

export default function BarcodeScannerModal({ onScan, onClose }) {
  const [error, setError] = useState('')

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
          <Scanner
            onScan={(codes) => {
              if (codes.length > 0) {
                onScan(codes[0].rawValue)
              }
            }}
            onError={(e) => {
              const kind = typeof e === 'object' && e !== null ? e.kind : ''
              if (kind === 'permission-denied') {
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
            styles={{
              container: {
                width: '100%',
                aspectRatio: '4/3',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#000',
              },
            }}
            components={{ finder: false }}
          />
        )}
      </div>
    </div>
  )
}