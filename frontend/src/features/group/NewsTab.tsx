import { useEffect, useState } from 'react'
import { EditionList } from '../edition/EditionArchive'
import type { Edition } from '../../lib/types'
import { api } from '../../lib/api'
import { useGroup } from './context'
import PaperTab from './PaperTab'

/** Weekly news: the latest paper first, then every earlier issue. */
export default function NewsTab() {
  const { group, latest } = useGroup()
  const [editions, setEditions] = useState<Edition[]>([])

  useEffect(() => {
    api<Edition[]>(`/groups/${group.id}/editions?limit=100`)
      .then(setEditions)
      .catch(() => setEditions([]))
  }, [group.id, latest?.id])

  const earlier = editions.filter((e) => e.id !== latest?.id)

  return (
    <div className="grid gap-6">
      <PaperTab />
      {earlier.length > 0 && (
        <section aria-labelledby="past-issues" className="grid gap-2.5">
          <h2 id="past-issues" className="text-[18px] font-bold">
            Earlier issues
          </h2>
          <EditionList groupId={group.id} editions={earlier} timeZone={group.timezone} />
        </section>
      )}
    </div>
  )
}
