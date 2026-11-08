import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { card, primary, secondary, subtitle } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { approximateLocation } from '../../lib/location'
import { deadlineLabel, shortStamp, timeUntil } from '../../lib/time'
import type { GroupSummary, Period, PublishResult, Reflection } from '../../lib/types'
import { useProfile } from '../account/context'
import { useGroup } from './context'
import NoteComposer, { type NoteInput } from './NoteComposer'
import { clock } from './useRecorder'

const listNames = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** Save a text copy of a new note into each chosen newsletter's current week. */
async function sendCopies(
  groups: GroupSummary[],
  body: string,
  location: { city: string | null; lat: number | null; lng: number | null },
) {
  return Promise.all(
    groups.map(async (g) => {
      try {
        const period = await api<Period>(`/groups/${g.id}/periods/current`)
        await api(`/groups/${g.id}/periods/${period.id}/reflections`, {
          method: 'POST',
          body: JSON.stringify({ body, ...location, status: 'submitted', ai_consent: true }),
        })
        return { name: g.name, ok: true }
      } catch {
        return { name: g.name, ok: false }
      }
    }),
  )
}

const explain = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.'

/** Key the working draft to the group and week so it cannot be saved into another week. */
/** `mode` limits the composer to recording (voice) or typing (write); without it, both are shown. */
export default function WeekTab({ mode }: { mode?: 'voice' | 'write' }) {
  const { group, period, refresh } = useGroup()
  if (!period)
    return (
      <section className={`${card} grid gap-3 p-4`}>
        <h2 className="text-xl font-bold">This week</h2>
        <p>The current week is not available. Refresh to check for the next week.</p>
        <button type="button" className={secondary} onClick={() => void refresh()}>
          Refresh week
        </button>
      </section>
    )
  return <WeekContent key={`${group.id}:${period.id}`} period={period} mode={mode} />
}

function WeekContent({ period, mode }: { period: Period; mode?: 'voice' | 'write' }) {
  const { group, isOrganizer, refresh } = useGroup()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [notes, setNotes] = useState<Reflection[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Reflection | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [serverClosed, setServerClosed] = useState(false)
  const actionInFlight = useRef(false)
  const loadSequence = useRef(0)
  const listUrl = `/groups/${group.id}/periods/${period.id}/reflections`
  const closed = serverClosed || Boolean(period.closed_at) || now >= new Date(period.deadline_at).getTime()
  const totalAudio = notes.reduce((sum, note) => sum + (note.audio_duration_seconds ?? 0), 0)
  const canAdd = !closed && notes.length < 30

  const load = useCallback(() => {
    const sequence = ++loadSequence.current
    return api<Reflection[]>(listUrl)
      .then((result) => {
        if (sequence !== loadSequence.current) return
        setNotes(result)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (sequence === loadSequence.current) setLoadError(explain(error))
      })
      .finally(() => {
        if (sequence === loadSequence.current) setLoading(false)
      })
  }, [listUrl])

  useEffect(() => {
    void load()
    return () => {
      loadSequence.current += 1
    }
  }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function save(data: NoteInput) {
    if (actionInFlight.current) throw new Error('Another change is still being saved.')
    if (Date.now() >= new Date(period.deadline_at).getTime() || period.closed_at) {
      setNow(Date.now())
      throw new Error('This week has closed. Refresh the week before adding another note.')
    }
    actionInFlight.current = true
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      let location = editing
        ? { city: editing.city, lat: editing.lat, lng: editing.lng }
        : {
            city: profile?.city ?? null,
            lat: profile?.location_mode === 'auto' ? profile.lat : null,
            lng: profile?.location_mode === 'auto' ? profile.lng : null,
          }
      let locationFallback = false
      if (!editing && profile?.location_mode === 'auto') {
        try {
          location = await approximateLocation()
        } catch {
          locationFallback = true
        }
      }
      const { also, ...note } = data
      const result = await api<Reflection>(
        editing ? `/groups/${group.id}/reflections/${editing.id}` : listUrl,
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify({ ...note, ...location, status: 'submitted', ai_consent: true }),
        },
      )
      // Text copies for the other newsletters picked. Audio stays with this group.
      const copies = editing ? [] : await sendCopies(also, note.body, location)
      setNotes((previous) =>
        editing ? previous.map((note) => (note.id === result.id ? result : note)) : [...previous, result],
      )
      setEditing(null)
      const sent = copies.filter((c) => c.ok).map((c) => c.name)
      const failed = copies.filter((c) => !c.ok).map((c) => c.name)
      setNotice(
        [
          locationFallback
            ? 'Note saved using your last known city. Your current location was unavailable.'
            : 'Note saved for this week.',
          sent.length ? `Also sent to ${listNames(sent)}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      if (failed.length)
        setActionError(`Couldn't send it to ${listNames(failed)}. Open that newsletter and add it there.`)
      void refresh()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && /closed/i.test(error.message))
        setServerClosed(true)
      throw error
    } finally {
      actionInFlight.current = false
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setBusy(true)
    setActionError(null)
    try {
      await api(`/groups/${group.id}/reflections/${id}`, { method: 'DELETE' })
      setNotes((previous) => previous.filter((note) => note.id !== id))
      setDeleting(null)
      setNotice('Note deleted.')
      void refresh()
    } catch (error) {
      setActionError(explain(error))
    } finally {
      actionInFlight.current = false
      setBusy(false)
    }
  }

  async function publish() {
    if (actionInFlight.current || composing || dirty) return
    actionInFlight.current = true
    setBusy(true)
    setActionError(null)
    try {
      const result = await api<PublishResult>(`/groups/${group.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ period_id: period.id }),
      })
      // Navigate before refreshing the period: refreshing remounts this component.
      if (result.edition_id) navigate(`/groups/${group.id}/editions/${result.edition_id}`)
      else navigate(`/groups/${group.id}/paper`, { state: { emptyWeek: true } })
      void refresh()
    } catch (error) {
      setActionError(explain(error))
    } finally {
      actionInFlight.current = false
      setBusy(false)
    }
  }

  const disabled = busy || composing
  return (
    <div className="grid gap-4 pb-4">
      <header>
        <h2 className="text-[24px] font-extrabold">This week</h2>
        <p className={subtitle}>
          {closed
            ? 'This week is closed. Refresh to load the next week.'
            : `Closes ${deadlineLabel(period.deadline_at, group.timezone)} (${timeUntil(period.deadline_at, now)} left).`}
        </p>
        <p className={`${subtitle} mt-1`}>
          {notes.length}/30 notes | {clock(totalAudio)}/30:00 audio this week
        </p>
      </header>
      {closed && (
        <button type="button" className={secondary} onClick={() => void refresh()}>
          Refresh week
        </button>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-accent-soft p-3 text-[14px]">
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-[14px] text-alert">
          {actionError}
        </p>
      )}
      <section className={`${card} grid gap-3 p-4`} aria-label="Your weekly notes">
        <h3 className="text-[18px] font-bold">Your notes</h3>
        <p className={subtitle}>
          Only you can see these until the paper comes out. Your notes go into this group's paper, which AI
          writes from everyone's notes. Original recordings stay private.
        </p>
        {loading ? (
          <p role="status">Loading your notes...</p>
        ) : loadError ? (
          <div role="alert">
            <p>{loadError}</p>
            <button type="button" className={`${secondary} mt-2`} onClick={() => void load()}>
              Retry loading notes
            </button>
          </div>
        ) : notes.length === 0 ? (
          <p className={subtitle}>No notes yet. Start with one small moment from your week.</p>
        ) : (
          <ol className="grid gap-3">
            {notes.map((note, index) => (
              <li
                key={note.id}
                className="rounded-xl border border-card-line bg-white/70 p-3"
                aria-label={`Note ${index + 1}`}
              >
                <p className="mb-2 text-[12px] text-glass-muted">
                  {shortStamp(note.recorded_at ?? note.updated_at, group.timezone)}
                  {note.city ? ` | ${note.city}` : ''}
                  {note.audio_duration_seconds ? ` | Voice ${clock(note.audio_duration_seconds)}` : ''}
                  {note.status === 'draft' ? ' | Draft (not included in the paper)' : ' | Saved'}
                </p>
                <p className="whitespace-pre-wrap break-words text-[15px]">{note.body || 'Empty draft'}</p>
                {!closed && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondary}
                      disabled={disabled || dirty || editing !== null}
                      onClick={() => {
                        setEditing(note)
                        setDeleting(null)
                        setActionError(null)
                        setNotice(null)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={secondary}
                      disabled={disabled || editing !== null || dirty}
                      onClick={() => {
                        setDeleting(note.id)
                        setActionError(null)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
                {deleting === note.id && (
                  <div className="mt-3 grid gap-2" role="group" aria-label="Confirm note deletion">
                    <p>Delete this note? It will not be included in the paper.</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={primary}
                        disabled={disabled || closed}
                        onClick={() => void remove(note.id)}
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        className={secondary}
                        disabled={disabled}
                        onClick={() => setDeleting(null)}
                      >
                        Keep note
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      {!loading && !loadError && (canAdd || editing || dirty) && (
        <div className="grid gap-3">
          <NoteComposer
            key={editing?.id ?? 'new'}
            note={editing}
            mode={mode}
            disabled={busy || closed}
            audioRemaining={Math.max(0, 1800 - totalAudio)}
            onSave={save}
            onBusyChange={setComposing}
            onDirtyChange={setDirty}
            onCancel={() => {
              setEditing(null)
              setDirty(false)
            }}
          />
        </div>
      )}
      {!closed && !canAdd && !editing && (
        <p role="status">You've reached 30 notes this week. You can still edit or delete your saved notes.</p>
      )}
      {isOrganizer && (
        <section className={`${card} grid gap-3 p-4`} aria-label="Publish this week">
          <h3 className="text-[18px] font-bold">Bring the week together</h3>
          <p className={subtitle}>
            Close this week and turn everyone's submitted notes into a newspaper. A new week opens
            immediately.
          </p>
          {(dirty || composing) && (
            <p className="text-[13px] text-alert">Save or discard your current note before publishing.</p>
          )}
          {!confirmPublish ? (
            <button
              type="button"
              className={primary}
              disabled={disabled || dirty || loading || Boolean(loadError)}
              onClick={() => setConfirmPublish(true)}
            >
              End week &amp; publish
            </button>
          ) : (
            <div className="grid gap-3" role="group" aria-label="Confirm publishing">
              <p>
                This closes the week for everyone. Saved notes will be locked. If nobody submitted a note, no
                newspaper or email will be created.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primary}
                  disabled={disabled || dirty}
                  onClick={() => void publish()}
                >
                  {busy ? 'Starting publication...' : 'Confirm & publish'}
                </button>
                <button
                  type="button"
                  className={secondary}
                  disabled={disabled}
                  onClick={() => setConfirmPublish(false)}
                >
                  Keep week open
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
