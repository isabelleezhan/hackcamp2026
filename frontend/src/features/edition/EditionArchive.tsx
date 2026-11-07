import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import type { Edition, EditionStatus } from '../../lib/types'
import { smart } from '../../lib/typography'
import { useGroup } from '../group/context'
import { GlassNotice } from './EditionPage'

const STATUS: Record<EditionStatus, { label: string; className: string }> = {
  published: { label: '', className: '' },
  pending: { label: 'Being written', className: 'text-accent-text' },
  generating: { label: 'Being written', className: 'text-accent-text' },
  failed: { label: "Couldn't be written", className: 'text-alert' },
}

function shortDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(iso))
}

/** A group's issues, newest first, styled like the prototype's People list. Embeddable on the group page. */
export function EditionList({
  groupId,
  editions,
  timeZone,
}: {
  groupId: string
  editions: Edition[]
  timeZone?: string
}) {
  if (!editions.length) {
    return (
      <p className="rounded-[12px] border border-card-line bg-card px-[14px] py-3 text-[14px] text-glass-text/80">
        No issues yet. The first one comes out Sunday at 6 p.m., once someone has written a note.
      </p>
    )
  }
  return (
    <ol className="overflow-hidden rounded-[14px] border border-card-line bg-card">
      {editions.map((e) => {
        const status = STATUS[e.status]
        return (
          <li key={e.id} className="border-glass-line [&+&]:border-t">
            <Link
              to={`/groups/${groupId}/editions/${e.id}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 hover:border border-card-line bg-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text"
            >
              <span className="grid size-10 place-items-center rounded-full bg-chip text-[15px] font-semibold tabular-nums">
                <span className="sr-only">Issue </span>
                {e.issue_number}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {e.content ? smart(e.content.headline) : `Issue ${e.issue_number}`}
                </span>
                <span className="block text-[13.5px] text-glass-muted">
                  {shortDate(e.published_at ?? e.created_at, timeZone)}
                </span>
              </span>
              <span className={`whitespace-nowrap text-[13px] ${status.className}`}>
                {status.label}
                <span className="ml-1.5 text-glass-text/30" aria-hidden="true">
                  ›
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/** Issues tab: every issue of this group, newest first. */
export default function IssuesTab() {
  const { group } = useGroup()
  const [editions, setEditions] = useState<Edition[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Edition[]>(`/groups/${group.id}/editions?limit=100`)
      .then(setEditions)
      .catch(() => setError("Couldn't load past issues. Check your connection and refresh."))
  }, [group.id])

  return (
    <div className="grid gap-3">
      <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">Issues</h2>
      {error ? (
        <GlassNotice title="Past issues not available">{error}</GlassNotice>
      ) : editions === null ? (
        <p className="text-[14px] text-glass-muted">Loading…</p>
      ) : (
        <EditionList groupId={group.id} editions={editions} timeZone={group.timezone} />
      )}
    </div>
  )
}
