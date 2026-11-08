import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/context'
import Avatar from '../../components/Avatar'
import { card, secondary } from '../../components/ui'
import { api } from '../../lib/api'
import { useProfile } from '../account/context'
import { useGroup } from './context'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="px-1 text-[13px] font-semibold text-glass-muted">{title}</h3>
      <div className={`${card} overflow-hidden`}>{children}</div>
    </section>
  )
}

const row = 'flex items-center gap-3 px-4 py-3 [&+&]:border-t [&+&]:border-card-line'

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
      className="shrink-0 rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold text-glass-text hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent-text"
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

/** Weekday and time the week closes, in the group's time zone (always Sunday 6 p.m. there). */
function closesLabel(timeZone: string) {
  const zone =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? timeZone
  return `Sundays at 6 p.m. ${zone}`
}

/** /groups/:groupId/settings: invite people, your email preference, members and your account. */
export default function GroupSettingsTab() {
  const { group, people, meId, refresh } = useGroup()
  const { profile } = useProfile()
  const { user, signOut } = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(group.membership?.email_enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canShare = typeof navigator.share === 'function'

  async function toggleEmail() {
    const next = !email
    setEmail(next)
    setSaving(true)
    setError(null)
    try {
      await api(`/groups/${group.id}/email-preference`, { method: 'PUT', body: JSON.stringify({ enabled: next }) })
      void refresh()
    } catch {
      setEmail(!next)
      setError("Couldn't update your email preference. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5 pb-2">
      <div className="flex items-center justify-between gap-2">
        <Link to=".." relative="path" className="text-[15px] font-semibold text-accent-text">
          ‹ Weekly news
        </Link>
      </div>
      <h2 className="-mt-2 text-[22px] font-extrabold tracking-[-0.01em]">Settings</h2>

      {params.get('new') && (
        <p role="status" className="rounded-[14px] bg-accent-soft px-4 py-3 text-[15px] font-semibold text-accent-text">
          Your newsletter is ready. Invite people with the link or code below.
        </p>
      )}

      <Section title="Invite people">
        <div className={row}>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-glass-muted">Invite link</p>
            <p className="truncate font-semibold" title={group.invitation_url}>
              {group.invitation_url.replace(/^https?:\/\//, '')}
            </p>
          </div>
          <CopyButton text={group.invitation_url} label="invite link" />
        </div>
        <div className={row}>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-glass-muted">Join code</p>
            <p className="text-[20px] font-extrabold tracking-[0.14em]">{group.join_code}</p>
          </div>
          <CopyButton text={group.join_code} label="join code" />
        </div>
        {canShare && (
          <div className={row}>
            <button
              type="button"
              className={`${secondary} w-full`}
              onClick={() =>
                void navigator
                  .share({ title: group.name, text: `Join ${group.name} on Community Newspaper`, url: group.invitation_url })
                  .catch(() => {})
              }
            >
              Share invite
            </button>
          </div>
        )}
      </Section>

      <Section title="The paper">
        <label className={`${row} cursor-pointer`}>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Email me each issue</span>
            <span className="block text-[13px] text-glass-muted">
              {email && user?.email ? `Sent to ${user.email}` : 'You can always read it here.'}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={email}
            disabled={saving}
            onChange={() => void toggleEmail()}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-[30px] w-[50px] shrink-0 rounded-full bg-glass-text/15 transition-colors after:absolute after:left-[3px] after:top-[3px] after:size-6 after:rounded-full after:bg-white after:shadow-[0_2px_4px_rgba(36,56,92,.25)] after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text peer-disabled:opacity-60"
          />
        </label>
        <div className={row}>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Comes out</span>
            <span className="block text-[13px] text-glass-muted">{closesLabel(group.timezone)}</span>
          </span>
        </div>
        {error && (
          <p role="alert" className="border-t border-card-line px-4 py-2.5 text-[14px] text-alert">
            {error}
          </p>
        )}
      </Section>

      <Section title={`Members (${people.length})`}>
        <ul>
          {people.map((p) => (
            <li key={p.id} className={row}>
              <Avatar id={p.id} name={p.id === meId ? 'Me' : p.name} size="sm" />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              <span className="truncate text-[13px] text-glass-muted">
                {p.role === 'organizer' ? 'Organizer' : (p.city ?? '')}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="You">
        <div className={row}>
          {profile && <Avatar id={profile.id} name={profile.display_name ?? 'Me'} size="sm" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{profile?.display_name ?? 'Your name'}</span>
            <span className="block truncate text-[13px] text-glass-muted">
              {profile?.city ?? 'City not set'}
              {user?.email && `, ${user.email}`}
            </span>
          </span>
          <Link to="/welcome" state={{ from: `/groups/${group.id}/settings` }} className="shrink-0 text-[14px] font-semibold text-accent-text">
            Edit
          </Link>
        </div>
        <button
          type="button"
          onClick={signOut}
          className={`${row} w-full text-left font-semibold text-alert hover:bg-glass-row`}
        >
          Sign out
        </button>
      </Section>
    </div>
  )
}
