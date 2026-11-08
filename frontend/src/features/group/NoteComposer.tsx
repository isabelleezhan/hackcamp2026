import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import type { GroupSummary } from '../../lib/types'
import { useGroup } from './context'
import { card, input, label, primary, secondary, subtitle } from '../../components/ui'
import type { AudioResult, Reflection } from '../../lib/types'
import VoiceNoteInput from './VoiceNoteInput'

export type NoteInput = {
  body: string
  audio_path: string | null
  audio_duration_seconds: number | null
  /** Other newsletters to send a text copy to (new notes only). */
  also: GroupSummary[]
}

type Props = {
  note: Reflection | null
  /** voice: record and review a transcript only. write: type only. Unset: both. */
  mode?: 'voice' | 'write'
  disabled: boolean
  audioRemaining: number
  onSave: (data: NoteInput) => Promise<void>
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
  onDirtyChange: (dirty: boolean) => void
}
const PROMPTS = ['Highlight', 'Hard part', 'Proud of', 'Next week']

/** Nothing is submitted until the author reviews the text and clicks Save. */
export default function NoteComposer({
  note,
  mode,
  disabled,
  audioRemaining,
  onSave,
  onCancel,
  onBusyChange,
  onDirtyChange,
}: Props) {
  const [body, setBody] = useState(note?.body ?? '')
  const [audio, setAudio] = useState<Pick<AudioResult, 'audio_path' | 'audio_duration_seconds'> | null>(
    note?.audio_path && note.audio_duration_seconds
      ? { audio_path: note.audio_path, audio_duration_seconds: note.audio_duration_seconds }
      : null,
  )
  const [reviewed, setReviewed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceDraft, setVoiceDraft] = useState(false)
  const [voiceVersion, setVoiceVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [also, setAlso] = useState<string[]>([])
  const otherGroups = useOtherGroups(!note)
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null)
  const maxLength = audio ? 4000 : 2000
  const dirty = note ? body !== note.body : Boolean(body || audio || voiceDraft)
  const locked = disabled || saving || voiceBusy

  useEffect(() => {
    onBusyChange(saving || voiceBusy)
    return () => onBusyChange(false)
  }, [saving, voiceBusy, onBusyChange])
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  function reset() {
    setBody('')
    setAudio(null)
    setReviewed(false)
    setError(null)
    setVoiceMessage(null)
    setVoiceVersion((version) => version + 1)
    onCancel()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (locked || !body.trim() || body.length > maxLength || (audio && !reviewed)) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        body: body.trim(),
        audio_path: audio?.audio_path ?? null,
        audio_duration_seconds: audio?.audio_duration_seconds ?? null,
        also: otherGroups.filter((g) => also.includes(g.id)),
      })
      setBody('')
      setAudio(null)
      setReviewed(false)
      setVoiceMessage(null)
      setAlso([])
      setVoiceVersion((version) => version + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your note. Your draft is still here.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`${card} grid gap-3 p-4`} aria-label={note ? 'Edit your note' : 'Write a note'}>
      <h3 className="text-[18px] font-bold">
        {note
          ? 'Edit your note'
          : mode === 'voice'
            ? audio
              ? 'Check your transcript'
              : 'Record a voice note'
            : mode === 'write'
              ? 'Write a note'
              : 'A moment from your week'}
      </h3>
      {!note && mode !== 'voice' && (
        <div role="group" aria-label="Writing prompts" className="flex flex-wrap gap-2">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
              disabled={locked || body.length + (body ? 2 : 0) + prompt.length + 2 > maxLength}
              onClick={() => {
                setBody((previous) => `${previous}${previous ? '\n\n' : ''}${prompt}: `)
                setReviewed(false)
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
      {!note && !audio && mode !== 'write' && (
        <VoiceNoteInput
          title={mode === 'voice' ? null : undefined}
          key={voiceVersion}
          disabled={disabled || saving || Boolean(body.trim())}
          audioRemaining={audioRemaining}
          onBusyChange={setVoiceBusy}
          onDraftChange={setVoiceDraft}
          onTranscribed={(result) => {
            setAudio({ audio_path: result.audio_path, audio_duration_seconds: result.audio_duration_seconds })
            setBody(result.transcript ?? '')
            setReviewed(false)
            setVoiceMessage(
              result.status === 'transcription_failed'
                ? result.detail
                : 'Review the transcript below and correct anything the AI misheard. It has not been submitted yet.',
            )
          }}
        />
      )}
      {!note && !audio && mode !== 'write' && body.trim() && (
        <p className={subtitle}>Save or discard this text before starting a voice note.</p>
      )}
      {voiceMessage && (
        <p role="status" className="text-[14px]">
          {voiceMessage}
        </p>
      )}
      {(note || mode !== 'voice' || audio || body.trim()) && (
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label htmlFor="weekly-note-body" className={label}>
              {audio ? 'Review and edit your transcript' : 'Your note'}
            </label>
            <textarea
              id="weekly-note-body"
              rows={6}
              className={`${input} resize-y`}
              placeholder="What would you like your people to know?"
              value={body}
              maxLength={maxLength}
              required
              disabled={locked}
              aria-describedby="weekly-note-count"
              onChange={(event) => {
                setBody(event.target.value)
                setReviewed(false)
              }}
            />
            <p id="weekly-note-count" className="mt-1 text-right text-[12px] text-glass-muted">
              {body.length}/{maxLength} characters
            </p>
          </div>
          {audio && (
            <label className="flex items-start gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={locked}
                onChange={(event) => setReviewed(event.target.checked)}
                className="mt-1"
              />
              <span>I reviewed this transcript and it accurately reflects my note.</span>
            </label>
          )}
          {!note && otherGroups.length > 0 && (
            <AlsoSendTo
              groups={otherGroups}
              selected={also}
              onChange={setAlso}
              disabled={locked}
              tooLong={body.length > 2000}
            />
          )}
          {error && (
            <p role="alert" className="text-[14px] text-alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className={primary}
              disabled={
                locked || !body.trim() || body.length > maxLength || Boolean(audio && !reviewed)
              }
            >
              {saving ? 'Saving...' : note ? 'Save changes' : 'Save note'}
            </button>
            {(note || dirty) && (
              <button type="button" className={secondary} disabled={locked} onClick={reset}>
                {note ? 'Cancel editing' : 'Discard draft'}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  )
}

/** Your other newsletters (not the open one), for "Also send to". */
function useOtherGroups(enabled: boolean) {
  const { group } = useGroup()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  useEffect(() => {
    if (!enabled) return
    let live = true
    api<GroupSummary[]>('/groups')
      .then((all) => live && setGroups(all.filter((g) => g.id !== group.id)))
      .catch(() => live && setGroups([]))
    return () => {
      live = false
    }
  }, [enabled, group.id])
  return enabled ? groups : []
}

function AlsoSendTo({
  groups,
  selected,
  onChange,
  disabled,
  tooLong,
}: {
  groups: GroupSummary[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled: boolean
  tooLong: boolean
}) {
  const all = selected.length === groups.length
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
      on ? 'border-accent bg-accent-soft text-accent-text' : 'border-card-line bg-white text-glass-text hover:bg-chip'
    }`
  return (
    <fieldset className="grid gap-2" disabled={disabled || tooLong}>
      <legend className="mb-1.5 text-[14px] font-semibold">Also send to</legend>
      <div className="flex flex-wrap gap-2">
        {groups.length > 1 && (
          <button type="button" aria-pressed={all} className={chip(all)} onClick={() => onChange(all ? [] : groups.map((g) => g.id))}>
            All my newsletters
          </button>
        )}
        {groups.map((g) => {
          const on = selected.includes(g.id)
          return (
            <button key={g.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => toggle(g.id)}>
              {on && <span aria-hidden="true">✓</span>}
              {g.name}
            </button>
          )
        })}
      </div>
      <p className="text-[12.5px] text-glass-muted">
        {tooLong
          ? 'Copies can be up to 2,000 characters. Shorten this note to send it to other newsletters.'
          : 'Each newsletter gets its own copy of the text. Voice recordings stay with this newsletter only.'}
      </p>
    </fieldset>
  )
}
