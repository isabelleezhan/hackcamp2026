import Avatar from '../../components/Avatar'
import type { Edition, MemberUpdate, Newspaper, Story } from '../../lib/types'
import { smart } from '../../lib/typography'

type Props = {
  edition: Edition & { content: Newspaper }
  groupName: string
  timeZone?: string
}

function issueDate(iso: string | null, timeZone?: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone }).format(
    new Date(iso),
  )
}

const card =
  'rounded-[16px] border border-card-line bg-card px-[18px] pb-5 pt-[18px] text-card-ink shadow-[0_6px_18px_rgba(36,56,92,.06)]'

function StoryCard({ story }: { story: MemberUpdate }) {
  return (
    <article className={`${card} grid gap-2`}>
      <div className="flex items-center gap-2.5 text-[13px] text-card-muted">
        <Avatar id={story.user_id} name={story.display_name} size="sm" />
        <span>
          <span className="font-semibold text-card-ink">{story.display_name}</span>
          {story.dateline && <>, {story.dateline}</>}
        </span>
      </div>
      <h3 className="font-reading text-[22px] font-bold leading-[1.2] text-balance">{smart(story.headline)}</h3>
      <p className="font-reading text-[17px] leading-[1.6]">{smart(story.text)}</p>
    </article>
  )
}

function Briefs({ title, items }: { title: string; items: Story[] }) {
  if (!items.length) return null
  return (
    <section className={card}>
      <h3 className="mb-2 text-[12.5px] font-semibold text-card-muted">{title}</h3>
      <ul className="grid list-disc gap-1.5 pl-[18px] font-reading text-[15.5px] leading-[1.5]">
        {items.map((item) => (
          <li key={item.headline + item.text}>
            <span className="font-semibold">{smart(item.headline)}.</span> {smart(item.text)}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** This week's paper, in the globe prototype's style. Renders validated JSON only, never HTML. */
export default function EditionView({ edition, groupName, timeZone }: Props) {
  const paper = edition.content
  const notes = new Set(paper.member_updates.flatMap((u) => u.source_reflection_ids)).size
  const people = paper.member_updates.length

  return (
    <article lang="en" className="grid gap-[14px]">
      <header>
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">Issue {edition.issue_number}</h1>
        <p className="mt-0.5 text-[14px] text-glass-muted">
          {issueDate(edition.published_at ?? edition.created_at, timeZone)}. {people}{' '}
          {people === 1 ? 'person' : 'people'} wrote in.
        </p>
      </header>

      <section className={`${card} grid gap-3`}>
        <div className="flex justify-between gap-2 border-b border-card-line pb-2 text-[12px] text-card-muted">
          <b className="font-reading text-[14px] text-card-ink">{groupName}</b>
          <span>Issue {edition.issue_number}</span>
        </div>
        <h2 className="font-reading text-[26px] font-bold leading-[1.15] text-balance">{smart(paper.headline)}</h2>
        <p className="font-reading text-[17px] leading-[1.6] text-card-ink/85">{smart(paper.introduction)}</p>
      </section>

      {paper.member_updates.map((story) => (
        <StoryCard key={story.user_id} story={story} />
      ))}

      <Briefs title="Little victories" items={paper.little_victories} />
      <Briefs title="Looking ahead" items={paper.looking_ahead} />

      <p className="px-1 pt-1 text-[13px] text-glass-muted">
        Written from {notes} {notes === 1 ? 'note' : 'notes'} by {people} {people === 1 ? 'person' : 'people'}. Every
        story comes from their own words.
      </p>
    </article>
  )
}
