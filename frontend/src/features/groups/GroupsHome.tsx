import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/context'
import Avatar from '../../components/Avatar'
import GlassPage from '../../components/GlassPage'
import { card, input, label, link, primary, secondary, subtitle, title } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import type { GroupSummary } from '../../lib/types'
import { useProfile } from '../account/context'

/** "/groups": your groups, create one, or join with a code. */
export default function GroupsHome() {
  const { profile } = useProfile()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [formError, setFormError] = useState<{ form: 'create' | 'join'; message: string } | null>(null)

  useEffect(() => {
    api<GroupSummary[]>('/groups')
      .then(setGroups)
      .catch(() => setError("Couldn't load your groups. Check your connection and refresh."))
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy('create')
    setFormError(null)
    try {
      const { id } = await api<{ id: string }>('/groups', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      navigate(`/groups/${id}/settings?new=1`)
    } catch (err) {
      setFormError({ form: 'create', message: err instanceof Error ? err.message : 'Could not create the group.' })
    } finally {
      setBusy(null)
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy('join')
    setFormError(null)
    try {
      const { id } = await api<{ id: string }>('/groups/join', { method: 'POST', body: JSON.stringify({ code: code.trim() }) })
      navigate(`/groups/${id}`)
    } catch (err) {
      setFormError({
        form: 'join',
        message:
          err instanceof ApiError && (err.status === 404 || err.status === 422)
            ? "That code doesn't match a group. Check it with whoever invited you."
            : 'Could not join right now. Try again.',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassPage>
      <div className="grid gap-5 py-2">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className={title}>Your groups</h1>
            {profile && (
              <p className={`${subtitle} mt-1`}>
                {profile.display_name}, {profile.city}.{' '}
                <Link to="/welcome" className={link}>
                  Change
                </Link>
              </p>
            )}
          </div>
          {user && (
            <button type="button" onClick={signOut} className="rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold">
              Sign out
            </button>
          )}
        </header>

        {error ? (
          <p role="alert" className={`${card} p-4 text-[15px] text-alert`}>
            {error}
          </p>
        ) : groups === null ? (
          <p role="status" className="text-[15px] text-glass-muted">
            Loading…
          </p>
        ) : groups.length === 0 ? (
          <p className={`${card} p-4 text-[15px] text-glass-text/80`}>
            You're not in a group yet. Start one for your family or friends, or join with the code someone sent you.
          </p>
        ) : (
          <ul className={`${card} overflow-hidden`}>
            {groups.map((g) => (
              <li key={g.id} className="border-card-line [&+&]:border-t">
                <Link to={`/groups/${g.id}`} className="flex items-center gap-3 px-3.5 py-3 hover:bg-glass-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text">
                  <Avatar id={g.id} name={g.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{g.name}</span>
                    <span className="block text-[13.5px] text-glass-muted">
                      {g.membership?.role === 'organizer' ? 'You organize this group' : 'Member'}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-glass-text/30">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={create} className={`${card} grid gap-3 p-4`}>
          <h2 className="text-[17px] font-bold">Start a group</h2>
          <div>
            <label htmlFor="group-name" className={label}>
              Name of your paper
            </label>
            <input id="group-name" className={input} value={name} maxLength={120} placeholder="The Long-Distance Weekly"
              onChange={(e) => setName(e.target.value)} required />
          </div>
          <button type="submit" className={primary} disabled={busy !== null || !name.trim()}>
            {busy === 'create' ? 'Creating…' : 'Create group'}
          </button>
          {formError?.form === 'create' && <p role="alert" className="text-[14px] text-alert">{formError.message}</p>}
        </form>

        <form onSubmit={join} className={`${card} grid gap-3 p-4`}>
          <h2 className="text-[17px] font-bold">Join with a code</h2>
          <div>
            <label htmlFor="join-code" className={label}>
              Invitation code
            </label>
            <input id="join-code" className={`${input} font-semibold uppercase tracking-[0.12em]`} value={code} maxLength={40}
              placeholder="K7M9P2QR" autoCapitalize="characters" autoComplete="off" spellCheck={false}
              onChange={(e) => setCode(e.target.value)} required />
          </div>
          <button type="submit" className={secondary} disabled={busy !== null || code.trim().length < 8}>
            {busy === 'join' ? 'Joining…' : 'Join group'}
          </button>
          {formError?.form === 'join' && <p role="alert" className="text-[14px] text-alert">{formError.message}</p>}
        </form>
      </div>
    </GlassPage>
  )
}
