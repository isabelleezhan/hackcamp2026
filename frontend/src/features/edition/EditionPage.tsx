import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { pillButton } from '../../components/GlassPage'
import { useGroup } from '../group/context'
import { api, ApiError } from '../../lib/api'
import type { Edition, Group, Newspaper } from '../../lib/types'
import EditionView from './EditionView'
import EmailPreview, { type EmailMessage } from './EmailPreview'

const POLL_MS = 3000

/** A status message in the prototype's frosted-glass style. */
export function GlassNotice({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="grid gap-3 rounded-[14px] border border-card-line bg-card px-4 py-5">
      <h1 className="text-[22px] font-bold leading-tight">{title}</h1>
      {children && <div className="text-[15px] text-glass-text/80">{children}</div>}
      {action && <div>{action}</div>}
    </div>
  )
}

/** Shows one edition, a "being written" state, or a failure with Retry for organizers. */
export function EditionState({
  edition,
  group,
  onRetry,
  retrying,
}: {
  edition: Edition
  group: Pick<Group, 'name' | 'timezone'> & { membership?: Pick<Group['membership'], 'role'> }
  onRetry?: () => void
  retrying?: boolean
}) {
  if (edition.status === 'published' && edition.content) {
    return (
      <EditionView
        edition={edition as Edition & { content: Newspaper }}
        groupName={group.name}
        timeZone={group.timezone}
      />
    )
  }
  if (edition.status === 'failed') {
    const organizer = group.membership?.role === 'organizer'
    return (
      <GlassNotice
        title={`Issue ${edition.issue_number} couldn't be put together`}
        action={
          organizer && onRetry ? (
            <button type="button" className={`${pillButton} bg-accent text-accent-ink`} onClick={onRetry} disabled={retrying}>
              {retrying ? 'Trying again…' : 'Try again'}
            </button>
          ) : undefined
        }
      >
        Everyone's notes are saved. {organizer ? 'Try again in a moment.' : 'Your organizer can try again.'}
      </GlassNotice>
    )
  }
  return (
    <GlassNotice title={`Putting together Issue ${edition.issue_number}…`}>
      Everyone's notes are being turned into this week's paper. This usually takes under a minute.
    </GlassNotice>
  )
}

export type EditionViewMode = 'app' | 'email'

/** App / Email switch, styled like the prototype's segmented control. */
export function ViewSwitch({ view, onChange }: { view: EditionViewMode; onChange: (v: EditionViewMode) => void }) {
  return (
    <div role="group" aria-label="Show this issue as" className="mb-[14px] grid grid-cols-2 gap-0.5 rounded-[10px] bg-chip p-0.5">
      {(['app', 'email'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`rounded-[8px] px-2 py-1.5 text-[13.5px] focus-visible:outline-2 focus-visible:outline-accent-text ${
            view === v ? 'bg-white font-semibold text-glass-text shadow-[0_1px_4px_rgba(36,56,92,.15)]' : 'text-glass-text/80'
          }`}
        >
          {v === 'app' ? 'In the app' : 'Email'}
        </button>
      ))}
    </div>
  )
}

/** One issue inside the group sheet: keeps checking while it's being written, App/Email switch,
 *  and Retry for organizers if it failed. */
export function EditionScreen({ editionId, back }: { editionId: string; back?: ReactNode }) {
  const { group, refresh: refreshGroup } = useGroup()
  const groupId = group.id
  const [edition, setEdition] = useState<Edition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [params, setParams] = useSearchParams()
  const view: EditionViewMode = params.get('view') === 'email' ? 'email' : 'app'
  const [email, setEmail] = useState<EmailMessage | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const e = await api<Edition>(`/groups/${groupId}/editions/${editionId}`)
      setEdition((prev) => {
        if (prev && prev.status !== 'published' && e.status === 'published') void refreshGroup()
        return e
      })
      setError(null)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "This issue doesn't exist, or you're not in this group."
          : "Couldn't load this issue. Check your connection and refresh.",
      )
    }
  }, [groupId, editionId, refreshGroup])

  useEffect(() => {
    void load()
  }, [load])

  // Keep checking while the paper is being written.
  useEffect(() => {
    if (!edition || edition.status === 'published' || edition.status === 'failed') return
    const t = setTimeout(() => void load(), POLL_MS)
    return () => clearTimeout(t)
  }, [edition, load])

  // Load the email preview the first time the Email view is opened.
  const published = edition?.status === 'published'
  useEffect(() => {
    if (view !== 'email' || !published || email) return
    api<EmailMessage>(`/groups/${groupId}/editions/${editionId}/email-preview`)
      .then(setEmail)
      .catch(() => setEmailError("Couldn't load the email preview. Refresh to try again."))
  }, [view, published, email, groupId, editionId])

  async function retry() {
    setRetrying(true)
    try {
      await api(`/groups/${groupId}/editions/${editionId}/retry`, { method: 'POST' })
      setEdition((e) => (e ? { ...e, status: 'pending' } : e))
    } catch {
      setError("Couldn't start a retry. Try again in a minute.")
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="grid gap-[14px]">
      {back}
      {error ? (
        <GlassNotice title="Issue not available">{error}</GlassNotice>
      ) : !edition ? (
        <GlassNotice title="Loading this week's paper…" />
      ) : (
        <div>
          {published && (
            <ViewSwitch view={view} onChange={(v) => setParams(v === 'email' ? { view: 'email' } : {}, { replace: true })} />
          )}
          {published && view === 'email' ? (
            emailError ? (
              <GlassNotice title="Email preview not available">{emailError}</GlassNotice>
            ) : email ? (
              <EmailPreview email={email} />
            ) : (
              <GlassNotice title="Loading the email…" />
            )
          ) : (
            <EditionState edition={edition} group={group} onRetry={retry} retrying={retrying} />
          )}
        </div>
      )}
    </div>
  )
}

/** /groups/:groupId/editions/:editionId (the edition email links here). */
export default function EditionRoute() {
  const { editionId = '' } = useParams()
  return (
    <EditionScreen
      editionId={editionId}
      back={
        <Link to=".." relative="path" className="text-[15px] font-semibold text-accent-text">
          ‹ All issues
        </Link>
      }
    />
  )
}
