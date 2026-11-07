import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/context'
import GlassPage, { pillButton } from '../components/GlassPage'

/** Sign-in happens on Auth0's hosted page; this screen sends people there and back. */
export default function Login() {
  const { configured, loading, user, signIn, signUp } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (!configured || user) return <Navigate to={from} replace />

  return (
    <GlassPage>
      <div className="grid gap-5 py-6">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">Community Newspaper</h1>
          <p className="mt-1 text-[15px] text-glass-muted">
            A few lines from everyone, every week. One paper for all of you on Sunday.
          </p>
        </div>
        <div className="grid gap-2.5 sm:max-w-sm">
          <button
            type="button"
            className={`${pillButton} bg-accent py-3 text-accent-ink`}
            disabled={loading}
            onClick={() => signIn(from)}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`${pillButton} bg-chip py-3`}
            disabled={loading}
            onClick={() => signUp(from)}
          >
            Create an account
          </button>
        </div>
        <p className="text-[13px] text-glass-muted">
          You'll sign in on a secure Auth0 page and come straight back here.
        </p>
      </div>
    </GlassPage>
  )
}
