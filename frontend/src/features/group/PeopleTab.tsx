import { Link, useParams } from 'react-router'
import Avatar from '../../components/Avatar'
import { card } from '../../components/ui'
import { localTime, weekday } from '../../lib/time'
import { useGroup, type Person } from './context'

/** Only whether someone has sent mail this week. What they wrote stays sealed until the paper. */
function Mail({ person, size = 22 }: { person: Person; size?: number }) {
  const sent = person.notes > 0
  return (
    <span aria-hidden="true" className={`leading-none ${sent ? '' : 'opacity-45 grayscale'}`} style={{ fontSize: size }}>
      {sent ? '💌' : '✉️'}
    </span>
  )
}

const mailLabel = (p: Person) => (p.notes > 0 ? 'Sent mail this week' : 'No mail yet')

/** People tab (the globe's list): everyone, their city and local time, and whether they've sent mail. */
export default function PeopleTab() {
  const { people, meId, group } = useGroup()
  const sent = people.filter((p) => p.notes > 0).length

  return (
    <div className="grid gap-[14px]">
      <div>
        <p className="text-[14px] text-glass-muted">
          {sent} of {people.length} sent mail this week. It opens Sunday at 6 p.m.
        </p>
        <div className="mt-2.5 flex gap-1" aria-hidden="true">
          {people.map((p) => (
            <i key={p.id} className={`h-[5px] flex-1 rounded-full transition-colors ${p.notes ? 'bg-accent' : 'bg-glass-text/10'}`} />
          ))}
        </div>
      </div>

      <ul className={`${card} overflow-hidden`}>
        {people.map((p) => (
          <li key={p.id} className="border-card-line [&+&]:border-t">
            <Link
              to={`/groups/${group.id}/people/${p.id}`}
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
              <span className="inline-flex items-center gap-1.5" title={mailLabel(p)}>
                <Mail person={p} />
                <span className="sr-only">{mailLabel(p)}</span>
                <span aria-hidden="true" className="text-glass-text/30">
                  ›
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** /groups/:groupId/people/:userId: where someone is, and whether their mail is in. */
export function PersonView() {
  const { userId = '' } = useParams()
  const { people, meId } = useGroup()
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

  const sent = person.notes > 0

  return (
    <div className="grid gap-[14px]">
      <Link to=".." relative="path" className="text-[15px] font-semibold text-accent-text">
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

      <div className={`${card} flex items-center gap-3.5 p-4`}>
        <Mail person={person} size={40} />
        <div>
          <p className="font-bold">{sent ? 'Mail is in' : 'No mail yet'}</p>
          <p className="text-[14px] text-glass-muted">
            {sent
              ? `${isMe ? 'Your' : `${person.name}'s`} mail stays sealed until the paper comes out Sunday at 6 p.m.`
              : isMe
                ? "You haven't sent anything this week."
                : `${person.name} hasn't sent anything this week.`}
          </p>
        </div>
      </div>

      {isMe && (
        <Link to={{ pathname: '../..', search: '?compose=write' }} relative="path" className="text-[15px] font-semibold text-accent-text">
          {sent ? 'Add another note' : 'Write your note'} ›
        </Link>
      )}
    </div>
  )
}
