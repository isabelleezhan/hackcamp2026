import { useSearchParams } from 'react-router'
import GlassPage, { BackLink } from '../../components/GlassPage'
import type { Edition } from '../../lib/types'
import { EditionList } from './EditionArchive'
import { EditionState, ViewSwitch } from './EditionPage'
import EmailPreview, { type EmailMessage } from './EmailPreview'
import sample from './sample-edition.json'
import sampleEmail from './sample-email.json'

/**
 * Development only: /preview/edition shows the template with sample-edition.json, no sign-in or
 * backend needed. ?state=generating | failed | archive shows the other states; ?view=email shows
 * the edition email (sample-email.json, built by the backend's real email template).
 * Regenerate the sample with real Gemini output:
 *   cd backend && .venv/bin/python -m scripts.preview_newspaper --edition ../frontend/src/features/edition/sample-edition.json
 */
export default function PreviewEdition() {
  const [params, setParams] = useSearchParams()
  const state = params.get('state')
  const edition = sample as Edition
  const group = { name: 'The Long-Distance Weekly', timezone: 'America/Vancouver', membership: { role: 'organizer' as const } }

  if (state === 'archive') {
    const older: Edition[] = [
      { ...edition, id: 'e13', issue_number: 13, status: 'generating', content: null, published_at: null, created_at: '2026-11-15T18:00:00-08:00' },
      edition,
      { ...edition, id: 'e11', issue_number: 11, status: 'failed', content: null, published_at: null, created_at: '2026-11-01T18:00:00-08:00' },
      { ...edition, id: 'e10', issue_number: 10, content: { ...edition.content!, headline: 'Bea moves to London' }, published_at: '2026-10-25T18:00:00-07:00' },
    ]
    return (
      <GlassPage>
        <BackLink to="/preview/edition">{group.name}</BackLink>
        <h1 className="mt-3 text-[28px] font-extrabold tracking-[-0.02em]">Past issues</h1>
        <div className="mt-4">
          <EditionList groupId="preview" editions={older} timeZone={group.timezone} />
        </div>
      </GlassPage>
    )
  }

  const shown: Edition =
    state === 'generating'
      ? { ...edition, status: 'generating', content: null }
      : state === 'failed'
        ? { ...edition, status: 'failed', content: null }
        : edition
  return (
    <GlassPage>
      <nav className="mb-4 flex items-center justify-between">
        <BackLink to="/preview/edition">{group.name}</BackLink>
        <a href="/preview/edition?state=archive" className="text-[15px] text-accent-text">
          Past issues
        </a>
      </nav>
      {!state && (
        <ViewSwitch
          view={params.get('view') === 'email' ? 'email' : 'app'}
          onChange={(v) => setParams(v === 'email' ? { view: 'email' } : {}, { replace: true })}
        />
      )}
      {!state && params.get('view') === 'email' ? (
        <EmailPreview email={sampleEmail as EmailMessage} />
      ) : (
        <EditionState edition={shown} group={group} onRetry={() => {}} />
      )}
    </GlassPage>
  )
}
