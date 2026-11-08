import { useEffect, useState } from 'react'
import Avatar from '../../components/Avatar'
import { api } from '../../lib/api'
import type { Edition, EditionImage, MemberUpdate, Newspaper, Story } from '../../lib/types'
import { smart } from '../../lib/typography'
import Postmark from './Postmark'

type Props = {
  edition: Edition & { content: Newspaper }
  groupName: string
  timeZone?: string
  /** Profile photos by user id, for the bylines. */
  photos?: Record<string, string | null>
}

function issueDate(iso: string | null, timeZone?: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone }).format(
    new Date(iso),
  )
}

function Byline({ story, photo }: { story: MemberUpdate; photo?: string | null }) {
  return (
    <p className="flex items-center gap-2.5 text-[13px] text-card-muted">
      <Avatar id={story.user_id} name={story.display_name} size="sm" src={photo} />
      <span>
        <span className="font-semibold text-card-ink">{story.display_name}</span>
        {story.dateline && <>, {story.dateline}</>}
      </span>
    </p>
  )
}

function Briefs({ title, items }: { title: string; items: Story[] }) {
  if (!items.length) return null
  return (
    <section className="grid gap-2 border-t border-card-line pt-6">
      <h3 className="font-display text-[21px] font-bold">{title}</h3>
      <ul className="grid list-disc gap-2 pl-[18px] font-reading text-[16.5px] leading-[1.6] marker:text-accent">
        {items.map((item) => (
          <li key={item.headline + item.text}>
            <span className="font-semibold">{smart(item.headline)}.</span> {smart(item.text)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function IssueImages({ groupId, editionId }: { groupId: string; editionId: string }) {
  const [images, setImages] = useState<EditionImage[]>([])

  useEffect(() => {
    const controller = new AbortController()
    api<EditionImage[]>(`/groups/${groupId}/editions/${editionId}/images`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(setImages)
      .catch(() => undefined)
    return () => controller.abort()
  }, [editionId, groupId])

  if (!images.length) return null
  return (
    <section className="mt-1" aria-labelledby="issue-photos-heading">
      <h3 id="issue-photos-heading" className="mb-3 text-[12.5px] font-semibold text-card-muted">
        Photos from the week
      </h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((image) => (
          <li key={image.id} className="aspect-square overflow-hidden rounded-xl bg-chip">
            <img
              src={image.url}
              alt={image.caption}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One issue as a single newsletter page: masthead, lead, photos from the week, everyone's stories
 * one after another, then the briefs. Renders validated JSON only, never HTML.
 */
export default function EditionView({ edition, groupName, timeZone, photos = {} }: Props) {
  const paper = edition.content
  const notes = new Set(paper.member_updates.flatMap((u) => u.source_reflection_ids)).size
  const people = paper.member_updates.length

  return (
    <article
      lang="en"
      className="grid gap-6 rounded-[18px] border border-card-line bg-card px-4 pb-6 pt-5 text-card-ink shadow-[0_6px_18px_rgba(36,56,92,.06)]"
    >
      <header className="grid gap-3">
        <div className="grid gap-2">
          {/* Stacked, so long group names never squeeze the date in a narrow sheet. */}
          <div className="flex items-start justify-between gap-2">
            <div className="grid min-w-0 gap-0.5 pt-1">
              <b className="font-display text-[18px] font-bold leading-tight">{groupName}</b>
              <span className="text-[12.5px] text-card-muted">
                Issue {edition.issue_number}, {issueDate(edition.published_at ?? edition.created_at, timeZone)}
              </span>
            </div>
            <div className="-my-2 -mr-1 shrink-0">
              <Postmark issue={edition.issue_number} iso={edition.published_at ?? edition.created_at} timeZone={timeZone} />
            </div>
          </div>
          {/* Airmail stripe, like the border of an envelope. */}
          <div
            aria-hidden="true"
            className="h-[6px] rounded-full"
            style={{
              background:
                'repeating-linear-gradient(-45deg, var(--color-accent) 0 10px, transparent 10px 15px, var(--color-record) 15px 25px, transparent 25px 30px)',
            }}
          />
        </div>
        <h1 className="font-display text-[29px] font-bold leading-[1.12] text-balance">
          {smart(paper.headline)}
        </h1>
        <p className="font-reading text-[18px] italic leading-[1.6] text-card-ink/80">{smart(paper.introduction)}</p>
        <IssueImages groupId={edition.group_id} editionId={edition.id} />
      </header>

      {paper.member_updates.map((story) => (
        <section key={story.user_id} className="grid gap-2.5 border-t border-card-line pt-6">
          <Byline story={story} photo={photos[story.user_id]} />
          <h2 className="font-display text-[24px] font-bold leading-[1.2] text-balance">{smart(story.headline)}</h2>
          <p className="font-reading text-[17px] leading-[1.7]">{smart(story.text)}</p>
        </section>
      ))}

      <Briefs title="Little victories" items={paper.little_victories} />
      <Briefs title="Looking ahead" items={paper.looking_ahead} />

      <p className="border-t border-card-line pt-4 text-[13px] text-card-muted">
        Written from {notes} {notes === 1 ? 'note' : 'notes'} by {people} {people === 1 ? 'person' : 'people'}. Every
        story comes from their own words.
      </p>
    </article>
  )
}
