import { useRef, useCallback } from 'react'

export default function useBarcodeScanner() {
  const scannerRef = useRef(null)

  const startScanning = useCallback((elementId, onScan, onError) => {
  }, [])

  const stopScanning = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current = null
    }
  }, [])

  return { startScanning, stopScanning, scannerRef }
}