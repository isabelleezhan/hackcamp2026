import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_SECONDS = 180
export const HINT_AT_SECONDS = 150

const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export type RecorderState = 'idle' | 'recording' | 'done' | 'error'

/** MediaRecorder with a 3-minute cap. Stops itself at 3:00 and keeps what was recorded. */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | null>(null)
  const started = useRef(0)

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    rec.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setBlob(null)
    setSeconds(0)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('error')
      setError("This browser can't record audio. Type your note instead.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = PREFERRED.find((t) => MediaRecorder.isTypeSupported(t))
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      r.onstop = () => {
        cleanup()
        setBlob(new Blob(chunks, { type: r.mimeType.split(';')[0] || 'audio/webm' }))
        setState('done')
      }
      rec.current = r
      r.start(1000)
      started.current = Date.now()
      setState('recording')
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - started.current) / 1000)
        setSeconds(Math.min(s, MAX_SECONDS))
        if (s >= MAX_SECONDS) stop()
      }, 250)
    } catch {
      cleanup()
      setState('error')
      setError('Microphone access was blocked. Allow it in your browser settings, or type your note instead.')
    }
  }, [cleanup, stop])

  const reset = useCallback(() => {
    cleanup()
    setBlob(null)
    setSeconds(0)
    setError(null)
    setState('idle')
  }, [cleanup])

  useEffect(() => cleanup, [cleanup])

  return { state, seconds, blob, error, start, stop, reset }
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
