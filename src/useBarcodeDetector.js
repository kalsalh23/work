import { useRef, useEffect, useCallback } from 'react'
import { BarcodeDetector } from 'barcode-detector/ponyfill'

const FORMATS = [
  'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_39', 'code_93', 'code_128', 'codabar', 'itf',
  'data_matrix', 'aztec', 'pdf_417',
]

export default function useBarcodeDetector({ onScan, onError, active = true }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const runningRef = useRef(false)
  const onScanRef = useRef(onScan)
  const onErrorRef = useRef(onError)

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const stop = useCallback(() => {
    runningRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    stop()
    const video = videoRef.current
    if (!video) return

    try {
      video.srcObject = null
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      video.srcObject = stream
      await video.play()

      detectorRef.current = new BarcodeDetector({ formats: FORMATS })
      runningRef.current = true

      const loop = async () => {
        while (runningRef.current) {
          const v = videoRef.current
          if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              const codes = await detectorRef.current.detect(v)
              if (codes.length > 0 && runningRef.current) {
                onScanRef.current?.(codes)
              }
            } catch (e) {
              onErrorRef.current?.(e)
            }
          }
          await new Promise(r => setTimeout(r, 300))
        }
      }
      loop()
    } catch (e) {
      onErrorRef.current?.(e)
    }
  }, [stop])

  useEffect(() => {
    if (active) {
      start()
    }
    return () => { stop() }
  }, [active, start, stop])

  return { videoRef, start, stop, streamRef }
}