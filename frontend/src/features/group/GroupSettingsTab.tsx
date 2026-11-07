import { useSearchParams } from 'react-router'
import Placeholder from '../../components/Placeholder'
import { card } from '../../components/ui'
import { useGroup } from './context'

/** /groups/:groupId/settings: invite people, members, your email preference. */
export default function GroupSettingsTab() {
  const { group } = useGroup()
  const [params] = useSearchParams()
  return (
    <Placeholder
      title="Group"
      ticket="FE-1"
      file="frontend/src/features/group/GroupSettingsTab.tsx"
      purpose="Invite people and choose whether you get the paper by email."
      todo={[
        'Invite link (group.invitation_url) and the 8-character code (group.join_code), each with a Copy button.',
        'Toggle "Email me the paper each week" from group.membership.email_enabled.',
        'Members: avatar, name, organizer badge and city (use people from useGroup()).',
        'Your name and city with a "Change" link to /welcome.',
        'The weekly deadline: "Closes Sundays at 6 p.m." in group.timezone.',
        'Sign out (useAuth().signOut).',
        'When opened with ?new=1 (right after creating a group), lead with "Your group is ready. Invite people."',
      ]}
      api={['GET  /groups/{id}   (already loaded: useGroup().group)', 'PUT  /groups/{id}/email-preference  {enabled}']}
      ready={['useGroup(): group, people, refresh()', 'Avatar component', 'Shared styles in components/ui.ts']}
    >
      {/* Enough to invite people while this page is being built. */}
      <section className={`${card} grid gap-1.5 p-4`}>
        {params.get('new') && <p className="font-bold">Your group is ready. Invite people:</p>}
        <p className="text-[14px] text-glass-muted">Invite link</p>
        <p className="break-all font-semibold">{group.invitation_url}</p>
        <p className="mt-1 text-[14px] text-glass-muted">Code</p>
        <p className="text-[20px] font-extrabold tracking-[0.12em]">{group.join_code}</p>
      </section>
    </Placeholder>
  )
}
