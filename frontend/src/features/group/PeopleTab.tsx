import { Link, useParams } from 'react-router'
import Avatar from '../../components/Avatar'
import { card, record } from '../../components/ui'
import { localTime, weekday } from '../../lib/time'
import { smart } from '../../lib/typography'
import { useGroup } from './context'

/** People tab (the globe's list): everyone, their city and local time, and who has written. */
export default function PeopleTab() {
  const { people, meId } = useGroup()
  const wrote = people.filter((p) => p.notes > 0).length

  return (
    <div className="grid gap-[14px]">
      <div>
        <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">People</h2>
        <p className="mt-0.5 text-[14px] text-glass-muted">
          {wrote} of {people.length} {people.length === 1 ? 'has' : 'have'} written this week.
        </p>
        <div className="mt-2.5 flex gap-1" aria-hidden="true">
          {people.map((p) => (
            <i key={p.id} className={`h-[5px] flex-1 rounded-full ${p.notes ? 'bg-accent' : 'bg-glass-text/10'}`} />
          ))}
        </div>
      </div>

      <ul className={`${card} overflow-hidden`}>
        {people.map((p) => (
          <li key={p.id} className="border-card-line [&+&]:border-t">
            <Link
              to={`people/${p.id}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 hover:bg-glass-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text"
            >
              <Avatar id={p.id} name={p.id === meId ? 'Me' : p.name} />
              <span className="min-w-0">
                <span className="block truncate font-bold">
                  {p.name}
                  {p.role === 'organizer' && <span className="ml-1.5 text-[12px] font-semibold text-glass-muted">organizer</span>}
                </span>
                <span className="block truncate text-[13.5px] text-glass-muted">
                  {p.city ?? 'City not set'}
                  {p.tz && `, ${localTime(p.tz)}`}
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1.5"
                title={p.notes ? `${p.notes} ${p.notes === 1 ? 'note' : 'notes'} this week` : 'Not written yet'}
              >
                <span aria-hidden="true" className={`text-[22px] leading-none ${p.notes ? '' : 'opacity-45 grayscale'}`}>
                  {p.notes ? '💌' : '✉️'}
                </span>
                <span className="sr-only">{p.notes ? `${p.notes} ${p.notes === 1 ? 'note' : 'notes'} this week` : 'Not written yet'}</span>
                <span aria-hidden="true" className="text-glass-text/30">
                  ›
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link to="week?record=1" className={record}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
        </svg>
        Record this week's note
      </Link>
    </div>
  )
}

/** /groups/:groupId/people/:userId: one person, and their story from the latest paper. */
export function PersonView() {
  const { userId = '' } = useParams()
  const { people, meId, latest, group } = useGroup()
  const person = people.find((p) => p.id === userId)
  const isMe = userId === meId

  if (!person) {
    return (
      <div className="grid gap-3">
        <Link to=".." relative="path" className="text-[15px] font-semibold text-accent-text">
          ‹ People
        </Link>
        <p className={`${card} p-4`}>This person isn't in the group.</p>
      </div>
    )
  }

  const story = latest?.content?.member_updates.find((u) => u.user_id === person.id)
  const issue = latest?.issue_number

  return (
    <div className="grid gap-[14px]">
      <Link to="../.." relative="path" className="text-[15px] font-semibold text-accent-text">
        ‹ People
      </Link>
      <div className="flex items-center gap-3.5">
        <Avatar id={person.id} name={isMe ? 'Me' : person.name} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-[24px] font-extrabold tracking-[-0.01em]">{person.name}</h2>
          <p className="text-[14px] text-glass-muted">
            {person.city ?? 'City not set'}
            {person.tz && `. It's ${localTime(person.tz)} on ${weekday(person.tz)} there.`}
          </p>
        </div>
      </div>

      <p className="rounded-[14px] bg-accent-soft px-3.5 py-2.5 text-[14px] text-[#5c4300]">
        {person.notes
          ? `${isMe ? 'You have' : `${person.name} has`} written ${person.notes} ${person.notes === 1 ? 'note' : 'notes'} this week.`
          : `${isMe ? "You haven't" : `${person.name} hasn't`} written this week yet.`}
      </p>

      {story ? (
        <article className={`${card} grid gap-2.5 p-[18px]`}>
          <div className="flex justify-between gap-2 border-b border-card-line pb-2 text-[12px] text-glass-muted">
            <b className="font-reading text-[14px] text-glass-text">{group.name}</b>
            <span>Issue {issue}</span>
          </div>
          <h3 className="font-reading text-[22px] font-bold leading-[1.2] text-balance">{smart(story.headline)}</h3>
          <p className="font-reading text-[17px] leading-[1.6]">
            {story.dateline && <span className="font-semibold">{story.dateline} — </span>}
            {smart(story.text)}
          </p>
          <p className="text-[12.5px] text-glass-muted">
            From {isMe ? 'your' : `${person.name}'s`} notes, Issue {issue}
          </p>
        </article>
      ) : (
        <p className={`${card} p-4 text-[15px] text-glass-text/80`}>
          {latest ? `${isMe ? "You weren't" : `${person.name} wasn't`} in Issue ${issue}.` : 'No paper has come out yet.'}
        </p>
      )}

      {isMe ? (
        <Link to="../../week" relative="path" className={record}>
          Write or record a note
        </Link>
      ) : (
        latest && (
          <Link to="../../paper" relative="path" className="text-[15px] font-semibold text-accent-text">
            Read everyone in Issue {issue} ›
          </Link>
        )
      )}
    </div>
  )
}
