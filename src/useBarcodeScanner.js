import { useRef, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

export default function useBarcodeScanner() {
  const scannerRef = useRef(null)

  const startScanning = useCallback((elementId, onScan, onError) => {
    const scanner = new Html5Qrcode(elementId, {
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
        onScan(decodedText)
      },
      () => {}
    ).catch((err) => {
      const msg = String(err)
      if (msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
        onError('permission_denied')
      } else if (msg.includes('NotFoundError')) {
        onError('no_camera')
      } else {
        onError('unknown')
      }
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