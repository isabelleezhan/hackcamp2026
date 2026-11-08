import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/context'
import Avatar from '../../components/Avatar'
import { card, input, secondary } from '../../components/ui'
import { api } from '../../lib/api'
import { inviteUrl } from '../../lib/invite'
import { useProfile } from '../account/context'
import { useGroup } from './context'
import PublicationSchedule from './PublicationSchedule'

const PHOTO_PX = 320

/** Crop to a centred square and re-encode as JPEG. Re-encoding also drops EXIF data such as GPS. */
async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(PHOTO_PX, side)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86),
  )
}

/** Your photo: shown to people in your groups next to your name, on the globe and in People. */
function ProfilePhoto() {
  const { profile, refresh: refreshProfile } = useProfile()
  const { refresh: refreshGroup } = useGroup()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!profile) return null

  async function save(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await Promise.all([refreshProfile(), refreshGroup()])
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Couldn't update your photo. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await save(async () => {
      let photo: Blob
      try {
        photo = await squarePhoto(file)
      } catch {
        throw new Error("That image couldn't be opened. Try a JPEG or PNG.")
      }
      const form = new FormData()
      form.append('file', photo, 'photo.jpg')
      await api('/me/avatar', { method: 'POST', body: form })
    })
  }

  return (
    <div className={row}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={profile.avatar_url ? 'Change your photo' : 'Add a photo'}
        className="group/photo relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:opacity-60"
      >
        <Avatar id={profile.id} name={profile.display_name ?? 'Me'} size="lg" src={profile.avatar_url} />
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 grid size-6 place-items-center rounded-full border-2 border-white bg-accent text-white shadow"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{busy ? 'Saving your photo…' : 'Profile photo'}</p>
        <p className="text-[13px] text-glass-muted">Only people in your newsletters can see it.</p>
        <div className="mt-1.5 flex gap-3 text-[14px] font-semibold">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-accent-text disabled:opacity-50">
            {profile.avatar_url ? 'Change' : 'Add a photo'}
          </button>
          {profile.avatar_url && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(() => api('/me/avatar', { method: 'DELETE' }))}
              className="text-glass-muted hover:text-alert disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-alert">
            {error}
          </p>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void choose(e)} />
    </div>
  )
}

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
  const invite = inviteUrl(group.join_code)

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
      <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">Settings</h2>

      <Section title="Newsletter">
        <RenameRow />
      </Section>

      {params.get('new') && (
        <p role="status" className="rounded-[14px] bg-accent-soft px-4 py-3 text-[15px] font-semibold text-accent-text">
          Your newsletter is ready. Invite people with the link or code below.
        </p>
      )}

      <Section title="Invite people">
        <div className={row}>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-glass-muted">Invite link</p>
            <p className="truncate font-semibold" title={invite}>
              {invite.replace(/^https?:\/\//, '')}
            </p>
          </div>
          <CopyButton text={invite} label="invite link" />
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
                  .share({ title: group.name, text: `Join ${group.name} on MailBuds`, url: invite })
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
        <PublicationSchedule key={group.id} />
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
              <Avatar id={p.id} name={p.id === meId ? 'Me' : p.name} size="sm" src={p.photo} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              <span className="truncate text-[13px] text-glass-muted">
                {p.role === 'organizer' ? 'Organizer' : (p.city ?? '')}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="You">
        <ProfilePhoto />
        <div className={row}>
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

      <LeaveOrDelete />
    </div>
  )
}

/** The newsletter's name; organizers can rename it in place. */
function RenameRow() {
  const { group, isOrganizer, refresh } = useGroup()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next = name.trim()
    if (!next) {
      setError('Enter a name')
      return
    }
    if (next === group.name) {
      setEditing(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api(`/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) })
      await refresh()
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Couldn't rename the newsletter. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className={`${row} flex-wrap`}>
        <label htmlFor="newsletter-name" className="sr-only">
          Newsletter name
        </label>
        <input
          id="newsletter-name"
          className={`${input} min-w-0 flex-1`}
          value={name}
          maxLength={120}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          disabled={busy}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        <div className="flex gap-3 text-[14px] font-semibold">
          <button type="submit" disabled={busy} className="text-accent-text disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false)
              setName(group.name)
              setError(null)
            }}
            className="text-glass-muted"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="w-full text-[13px] text-alert">
            {error}
          </p>
        )}
      </form>
    )
  }

  return (
    <div className={row}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-glass-muted">Name</span>
        <span className="block truncate font-semibold">{group.name}</span>
      </span>
      {isOrganizer && (
        <button
          type="button"
          onClick={() => {
            setName(group.name)
            setEditing(true)
          }}
          className="shrink-0 text-[14px] font-semibold text-accent-text"
        >
          Rename
        </button>
      )}
    </div>
  )
}

/** Leave (anyone) or delete for everyone (organizers), each behind a confirmation step. */
function LeaveOrDelete() {
  const { group, isOrganizer, people } = useGroup()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<'leave' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alone = people.length <= 1

  async function run(action: 'leave' | 'delete') {
    setBusy(true)
    setError(null)
    try {
      await api(action === 'leave' ? `/groups/${group.id}/leave` : `/groups/${group.id}`, {
        method: action === 'leave' ? 'POST' : 'DELETE',
      })
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  const confirmText =
    confirming === 'delete'
      ? `Delete ${group.name} for everyone? All notes, issues and photos in it are removed. This can't be undone.`
      : alone
        ? `Leave ${group.name}? You're the only member, so the newsletter and everything in it is deleted.`
        : `Leave ${group.name}? Your notes for this week are removed. Issues that already came out keep your stories.`

  return (
    <section className="grid gap-2" aria-label="Leave or delete">
      <div className={`${card} overflow-hidden`}>
        {confirming ? (
          <div className="grid gap-3 px-4 py-3">
            <p className="text-[14px]">{confirmText}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(confirming)}
                className="inline-flex items-center justify-center rounded-[12px] bg-alert px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
              >
                {busy ? 'Working…' : confirming === 'delete' ? 'Delete for everyone' : 'Leave newsletter'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(null)
                  setError(null)
                }}
                className={`${secondary} px-4 py-2.5 text-[14px]`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming('leave')}
              className={`${row} w-full text-left font-semibold text-alert hover:bg-glass-row`}
            >
              Leave newsletter
            </button>
            {isOrganizer && (
              <button
                type="button"
                onClick={() => setConfirming('delete')}
                className={`${row} w-full text-left font-semibold text-alert hover:bg-glass-row`}
              >
                Delete newsletter
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="border-t border-card-line px-4 py-2.5 text-[13px] text-alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
