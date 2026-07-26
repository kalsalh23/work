import { useRef, useEffect, useCallback } from 'react'
import { BarcodeDetector } from 'barcode-detector/ponyfill'

const FORMATS = [
  'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_39', 'code_93', 'code_128', 'codabar', 'itf',
  'data_matrix', 'aztec', 'pdf_417',
]

const ERR_UNKNOWN = 'unknown'
const ERR_PERMISSION = 'permission_denied'
const ERR_NO_CAMERA = 'no_camera'
const ERR_IN_USE = 'in_use'
const ERR_INVALID = 'invalid_constraints'

function classifyError(e) {
  const name = e?.name || ''
  const msg = e?.message || ''
  if (name === 'NotAllowedError' || msg.includes('permission') || msg.includes('Permission')) return ERR_PERMISSION
  if (name === 'NotFoundError' || msg.includes('NotFound')) return ERR_NO_CAMERA
  if (name === 'NotReadableError' || msg.includes('in use') || msg.includes('busy')) return ERR_IN_USE
  if (name === 'OverconstrainedError' || name === 'TypeError') return ERR_INVALID
  return ERR_UNKNOWN
}

export default function useBarcodeDetector({ onError, onScan, active = true }) {
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
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const start = useCallback(async () => {
    stop()

    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.(Object.assign(new Error('camera API not available'), { name: 'NotSupportedError' }))
      return
    }

    const video = videoRef.current
    if (!video) {
      onErrorRef.current?.(Object.assign(new Error('video element not in DOM'), { name: 'NotSupportedError' }))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      video.srcObject = stream
      await video.play()

      detectorRef.current = new BarcodeDetector({ formats: FORMATS })
      runningRef.current = true

      ;(async function loop() {
        while (runningRef.current) {
          const v = videoRef.current
          if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              const codes = await detectorRef.current.detect(v)
              if (codes.length > 0 && runningRef.current) {
                onScanRef.current?.(codes)
              }
            } catch (_) {}
          }
          await new Promise(r => setTimeout(r, 400))
        }
      })()
    } catch (e) {
      onErrorRef.current?.(e)
    }
  }, [stop])

  useEffect(() => {
    if (active) start()
    return () => stop()
  }, [active, start, stop])

  return { videoRef, start, stop, streamRef, classifyError }
}