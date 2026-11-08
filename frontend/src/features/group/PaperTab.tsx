import { Link, useLocation } from 'react-router'
import { card } from '../../components/ui'
import { deadlineLabel } from '../../lib/time'
import { EditionScreen } from '../edition/EditionPage'
import { useGroup } from './context'

/** /groups/:groupId/paper: the latest published paper, with everyone's stories. */
export default function PaperTab() {
  const { latest, period, group } = useGroup()
  const location = useLocation()
  const emptyWeek = (location.state as { emptyWeek?: boolean } | null)?.emptyWeek
  const notice = emptyWeek && (
    <p role="status" className={`${card} p-4 text-[15px]`}>
      The issue period closed without submitted notes. No newspaper or email was created. A new period is open.
    </p>
  )
  if (!latest) {
    return (
      <div className="grid gap-3">
        {notice}
        <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">Latest issue</h2>
        <p className={`${card} p-4 text-[15px] text-glass-text/80`}>
          No paper yet. The first issue comes out
          {period ? ` after notes close ${deadlineLabel(period.deadline_at, group.timezone)}` : ' after the next cutoff'}, once
          someone has written a note.{' '}
          <Link to={{ search: '?compose=write' }} className="font-semibold text-accent-text">
            Write one now
          </Link>
        </p>
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      {notice}
      <EditionScreen editionId={latest.id} />
    </div>
  )
}
