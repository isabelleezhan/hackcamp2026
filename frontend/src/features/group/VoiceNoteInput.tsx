import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { primary, record, secondary, subtitle } from '../../components/ui'
import { api } from '../../lib/api'
import type { AudioResult } from '../../lib/types'
import { useGroup } from './context'
import { clock, HINT_AT_SECONDS, MAX_SECONDS, useRecorder } from './useRecorder'

const MIME: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
}
const MAX_BYTES = 10 * 1024 * 1024

type Props = {
  disabled: boolean
  audioRemaining: number
  onBusyChange: (busy: boolean) => void
  onTranscribed: (audio: AudioResult) => void
  onDraftChange: (draft: boolean) => void
  /** Heading above the recorder; null hides it (when the panel already says "Record a voice note"). */
  title?: string | null
}

export default function VoiceNoteInput({
  disabled,
  audioRemaining,
  onBusyChange,
  onTranscribed,
  onDraftChange,
  title = 'Or tell it in your own voice',
}: Props) {
  const { group } = useGroup()
  const recorder = useRecorder()
  const { state: recorderState, stop: stopRecording } = recorder
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const recording = recorder.state === 'recording' || recorder.state === 'requesting'
  const audio = file ?? recorder.blob
  const busy = recording || processing
  const unavailable = disabled || audioRemaining <= 0

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])
  useEffect(() => {
    if (disabled && recorderState === 'recording') stopRecording()
  }, [disabled, recorderState, stopRecording])
  useEffect(() => {
    onDraftChange(Boolean(audio) || recording)
    return () => onDraftChange(false)
  }, [audio, recording, onDraftChange])

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    setError(null)
    if (!selected.size || selected.size > MAX_BYTES) {
      setError('Choose a nonempty audio file no larger than 10 MB.')
      return
    }
    const extension = selected.name.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME[extension] ?? selected.type.split(';')[0]
    if (!Object.values(MIME).includes(mime)) {
      setError('Choose a WebM, Ogg, MP3, M4A, WAV or AAC audio file.')
      return
    }
    recorder.reset()
    setFile(new File([selected], selected.name, { type: mime }))
  }

  async function transcribe() {
    if (!audio || busy || unavailable || request.current) return
    const controller = new AbortController()
    request.current = controller
    setProcessing(true)
    setError(null)
    try {
      if (!audio.size || audio.size > MAX_BYTES)
        throw new Error(
          'Audio must be nonempty and no larger than 10 MB. Try a shorter recording, or type instead.',
        )
      const extension = Object.keys(MIME).find((key) => MIME[key] === audio.type.split(';')[0]) ?? 'webm'
      const form = new FormData()
      form.append('file', audio, file?.name ?? `voice-note.${extension}`)
      form.append('ai_consent', 'true')
      const result = await api<AudioResult>(`/groups/${group.id}/audio`, {
        method: 'POST', body: form, signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (result.audio_duration_seconds > audioRemaining)
        throw new Error(
          'This recording exceeds your remaining audio allowance this week. Use a shorter clip or type instead.',
        )
      onTranscribed(result)
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not transcribe this recording. Try again, or type your note instead.',
      )
    } finally {
      request.current = null
      setProcessing(false)
    }
  }

  return (
    <div className="grid gap-2 rounded-xl bg-chip/50 p-3" aria-label="Voice note">
      {title && <p className="text-[14px] font-semibold">{title}</p>}
      <p className={subtitle}>Up to 3 minutes and 10 MB. You'll review the transcript before saving.</p>
      {audioRemaining <= 0 && (
        <p className={subtitle}>You've used 30 minutes of audio this week. You can still type a note.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button
            type="button"
            className={record}
            disabled={recorder.state === 'requesting'}
            onClick={recorder.stop}
          >
            {recorder.state === 'requesting'
              ? 'Waiting for microphone...'
              : `Stop recording (${clock(recorder.seconds)})`}
          </button>
        ) : (
          <button
            type="button"
            className={record}
            disabled={unavailable || processing}
            onClick={() => {
              setFile(null)
              setError(null)
              void recorder.start()
            }}
          >
            {audio ? 'Record again' : 'Record a voice note'}
          </button>
        )}
        <label
          className={`${secondary} ${unavailable || busy ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
        >
          Upload audio
          <input
            type="file"
            accept=".webm,.ogg,.mp3,.m4a,.mp4,.wav,.aac,audio/*"
            aria-label="Upload audio file"
            className="sr-only"
            disabled={unavailable || busy}
            onChange={chooseFile}
          />
        </label>
      </div>
      {recorder.state === 'recording' && (
        <p role="status" className="text-[13px]">
          {clock(recorder.seconds)} / {clock(MAX_SECONDS)}
          {recorder.seconds >= HINT_AT_SECONDS
            ? ' - 30 seconds or less remaining. Recording stops at 3:00.'
            : ''}
        </p>
      )}
      {audio && !recording && (
        <>
          <AudioPreview audio={audio} />
          <p className="break-all text-[12px] text-glass-muted">
            {file?.name ?? `Recording (${clock(recorder.seconds)})`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={unavailable || processing}
              onClick={() => void transcribe()}
            >
              {processing ? 'Transcribing...' : 'Transcribe audio'}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={processing}
              onClick={() => {
                setFile(null)
                recorder.reset()
                setError(null)
              }}
            >
              Discard audio
            </button>
          </div>
        </>
      )}
      {(error || recorder.error) && (
        <p role="alert" className="text-[14px] text-alert">
          {error ?? recorder.error}
        </p>
      )}
      {processing && (
        <p role="status" className={subtitle}>
          Turning your audio into text. Nothing is submitted until you review and save.
        </p>
      )}
    </div>
  )
}

function AudioPreview({ audio }: { audio: Blob }) {
  const element = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(audio)
    if (element.current) element.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [audio])
  return <audio ref={element} controls aria-label="Preview your voice note" className="w-full max-w-full" />
}
