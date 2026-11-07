import { Link } from 'react-router'
import { card } from '../../components/ui'
import { deadlineLabel } from '../../lib/time'
import { EditionScreen } from '../edition/EditionPage'
import { useGroup } from './context'

/** /groups/:groupId/paper: the latest published paper, with everyone's stories. */
export default function PaperTab() {
  const { latest, period, group } = useGroup()
  if (!latest) {
    return (
      <div className="grid gap-3">
        <h2 className="text-[22px] font-extrabold tracking-[-0.01em]">Paper</h2>
        <p className={`${card} p-4 text-[15px] text-glass-text/80`}>
          No paper yet. The first issue comes out
          {period ? ` ${deadlineLabel(period.deadline_at, group.timezone)}` : ' at the end of the week'}, once someone has
          written a note.{' '}
          <Link to="../week" relative="path" className="font-semibold text-accent-text">
            Write one now
          </Link>
        </p>
      </div>
    )
  }
  return <EditionScreen editionId={latest.id} />
}
