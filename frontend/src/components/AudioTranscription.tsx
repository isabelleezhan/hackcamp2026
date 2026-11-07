import { useRef, useState } from 'react'
import { api } from '../lib/api'

export default function AudioTranscription() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function transcribe() {
    if (!file || busy) return
    setError('')
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const result = await api<{ text: string }>('/audio/transcribe', { method: 'POST', body })
      setText(result.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 border-t border-stone-300 pt-6" aria-labelledby="audio-heading">
      <h2 id="audio-heading" className="font-display text-2xl font-bold">Your week, in your words</h2>
      <p id="audio-help" className="mt-2 text-sm text-stone-600">
        Choose an audio reflection to transcribe with Gemini. MP3, WAV, M4A, OGG, or FLAC;
        up to 3 minutes and 10 MB. Your audio is sent to Google for AI processing.
        Nothing is saved or shared with your group here.
      </p>
      <input
        ref={input}
        type="file"
        accept=".mp3,.wav,.m4a,.ogg,.flac"
        aria-label="Choose an audio reflection"
        aria-describedby="audio-help"
        className="sr-only"
        tabIndex={-1}
        disabled={busy}
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null
          setError('')
          if (next && next.size > 10 * 1024 * 1024) {
            setError('Audio must be 10 MB or smaller.')
            setFile(null)
            event.target.value = ''
            return
          }
          if (next) {
            setFile(next)
            setText('')
          }
        }}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded border border-ink px-4 py-2 text-sm disabled:opacity-50"
        >Choose audio file</button>
        <button
          type="button"
          disabled={!file || busy}
          onClick={transcribe}
          className="rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >{busy ? 'Transcribing…' : 'Transcribe with Gemini'}</button>
      </div>
      <p role="status" className="mt-2 text-sm text-stone-600">
        {busy ? 'Listening to your audio. This may take a minute…' : file?.name ?? 'No audio selected.'}
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <label htmlFor="audio-transcript" className="mt-5 block text-sm font-semibold">
        Transcript / reflection
      </label>
      <textarea
        id="audio-transcript"
        rows={6}
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        placeholder="Your transcript will appear here. You can also type your reflection."
        className="mt-2 w-full rounded border border-stone-400 bg-white p-3 font-serif"
      />
      <p className="mt-1 text-sm text-stone-600">Review and edit the wording. This draft is not saved.</p>
    </section>
  )
}
