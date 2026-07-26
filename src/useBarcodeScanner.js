import { useRef, useCallback } from 'react'

export default function useBarcodeScanner() {
  const scannerRef = useRef(null)

  const startScanning = useCallback((elementId, onScan, onError) => {
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const scanner = new Html5Qrcode(elementId)
      scannerRef.current = scanner

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        formatsToSupport: [
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        ],
      }

      scanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          scanner.stop().catch(() => {})
          onScan(decodedText)
        },
        () => {}
      ).catch((err) => {
        if (err?.includes('NotAllowedError') || err?.includes('Permission denied')) {
          onError('permission_denied')
        } else if (err?.includes('NotFoundError')) {
          onError('no_camera')
        } else {
          onError('unknown')
        }
      })
    })
  }, [])

  const stopScanning = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [])

  return { startScanning, stopScanning }
}