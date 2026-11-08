import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_SECONDS = 180
export const HINT_AT_SECONDS = 150

const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'done' | 'error'

/** MediaRecorder with a 3-minute cap. Stops itself at 3:00 and keeps what was recorded. */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | null>(null)
  const started = useRef(0)
  const generation = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    generation.current += 1
    const recorder = rec.current
    rec.current = null
    if (recorder) {
      recorder.onstop = null
      recorder.ondataavailable = null
      recorder.onerror = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
  }, [])

  const start = useCallback(async () => {
    cleanup()
    const run = generation.current
    setError(null)
    setBlob(null)
    setSeconds(0)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('error')
      setError("This browser can't record audio. Type your note instead.")
      return
    }
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (run !== generation.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const mimeType = PREFERRED.find((t) => MediaRecorder.isTypeSupported(t))
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      r.onstop = () => {
        if (run !== generation.current) return
        cleanup()
        setBlob(new Blob(chunks, { type: r.mimeType.split(';')[0] || 'audio/webm' }))
        setState('done')
      }
      r.onerror = () => {
        if (run !== generation.current) return
        cleanup()
        setState('error')
        setError('Recording failed. Try again, upload an audio file, or type your note.')
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
      if (run !== generation.current) return
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
