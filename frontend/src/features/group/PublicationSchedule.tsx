import { useState, type FormEvent } from 'react'
import { primary } from '../../components/ui'
import { api } from '../../lib/api'
import { useGroup } from './context'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const inputStyle = 'w-full rounded-xl border border-card-line bg-card px-3 py-2 text-glass-text focus-visible:outline-2 focus-visible:outline-accent-text'

/** Calendar-day controls only; the cutoff is fixed at 23:59 before the publication date. */
export default function PublicationSchedule() {
  const { group, period, isOrganizer, refresh } = useGroup()
  const [mode, setMode] = useState(group.publication_mode ?? 'weekly')
  const [weekday, setWeekday] = useState(group.publication_weekday ?? 6)
  const [interval, setInterval] = useState(String(group.publication_interval_days ?? 2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const summary = group.publication_mode === 'interval'
    ? `Every ${group.publication_interval_days} day${group.publication_interval_days === 1 ? '' : 's'}`
    : `Every ${DAYS[group.publication_weekday ?? 6]}`
  const nextDate = period && new Intl.DateTimeFormat('en-US', {
    timeZone: group.timezone, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(new Date(period.deadline_at).getTime() + 60_000))

  async function save(event: FormEvent) {
    event.preventDefault()
    const days = Number(interval)
    if (mode === 'interval' && (!Number.isInteger(days) || days < 1 || days > 365)) {
      setError('Choose a whole number of days from 1 to 365.')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const schedule = mode === 'weekly' ? { mode, weekday } : { mode, interval_days: days }
      await api(`/groups/${group.id}/schedule`, { method: 'PUT', body: JSON.stringify(schedule) })
      await refresh()
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the schedule. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 border-t border-card-line px-4 py-3">
      <div>
        <h4 className="font-semibold">Publication schedule</h4>
        <p className="text-[13px] text-glass-muted">{summary}</p>
        <p className="mt-1 text-[13px] font-semibold">Publication time zone: Pacific Time (America/Vancouver)</p>
        {nextDate && <p className="mt-1 text-[13px]">Next publication date: {nextDate}</p>}
        <p id="schedule-cutoff" className="mt-1 text-[13px] text-glass-muted">
          All publication dates use Pacific Time, wherever you live. Notes close at 11:59 p.m.
          the night before. Publication starts after midnight and the paper appears after processing.
        </p>
      </div>
      {isOrganizer && (
        <form onSubmit={(event) => void save(event)} className="grid gap-3" aria-describedby="schedule-cutoff">
          <fieldset disabled={saving} className="grid gap-3 disabled:opacity-60">
            <legend className="sr-only">Change publication schedule</legend>
            <label className="grid gap-1 text-[14px] font-semibold">
              Publish
              <select value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setSaved(false) }} className={inputStyle}>
                <option value="weekly">Every week on a day</option>
                <option value="interval">Every number of days</option>
              </select>
            </label>
            {mode === 'weekly' ? (
              <label className="grid gap-1 text-[14px] font-semibold">
                Publication day
                <select value={weekday} onChange={(event) => { setWeekday(Number(event.target.value)); setSaved(false) }} className={inputStyle}>
                  {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </label>
            ) : (
              <label className="grid gap-1 text-[14px] font-semibold">
                Days between issues
                <input type="number" min="1" max="365" step="1" required value={interval}
                  onChange={(event) => { setInterval(event.target.value); setSaved(false) }} className={inputStyle} />
                <span className="text-[12px] font-normal text-glass-muted">The first date is this many days after you save a changed schedule.</span>
              </label>
            )}
            <p className="text-[12px] text-glass-muted">Changes update the current deadline. If it is already due, they apply to the next issue.</p>
            <button type="submit" className={primary}>{saving ? 'Saving…' : 'Save schedule'}</button>
          </fieldset>
        </form>
      )}
      {saved && <p role="status" className="text-[13px] text-accent-text">Publication schedule saved.</p>}
      {error && <p role="alert" className="text-[13px] text-alert">{error}</p>}
    </div>
  )
}
