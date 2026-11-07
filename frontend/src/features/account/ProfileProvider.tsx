import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../../auth/context'
import GlassPage from '../../components/GlassPage'
import { api } from '../../lib/api'
import { browserTimeZone } from '../../lib/time'
import type { Profile } from '../../lib/types'
import { ProfileContext, useProfile, type ProfileState } from './context'

/** Loads GET /me once signed in and keeps the profile's time zone in sync with the browser. */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, configured } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const signedIn = Boolean(user) || !configured // unconfigured = local mock / preview mode

  const refresh = useCallback(async () => {
    try {
      const me = await api<Profile>('/me')
      setProfile(me)
      setError(null)
      const tz = browserTimeZone()
      if (tz && me.timezone !== tz) {
        api<Profile>('/me', { method: 'PATCH', body: JSON.stringify({ timezone: tz }) })
          .then(setProfile)
          .catch(() => {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your account')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (signedIn) void refresh()
  }, [signedIn, refresh])

  const update = useCallback(async (changes: Partial<Profile>) => {
    const saved = await api<Profile>('/me', { method: 'PATCH', body: JSON.stringify(changes) })
    setProfile(saved)
    return saved
  }, [])

  const value = useMemo<ProfileState>(
    () => ({ profile, loading: signedIn && loading, error, update, refresh }),
    [profile, loading, error, update, refresh, signedIn],
  )
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

/** Sends people without a city to onboarding first. Wrap pages that need a complete profile. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, loading, error, refresh } = useProfile()
  const location = useLocation()
  if (loading) {
    return (
      <GlassPage>
        <p role="status" className="text-[15px] text-glass-muted">
          Loading your account…
        </p>
      </GlassPage>
    )
  }
  if (error || !profile) {
    return (
      <GlassPage>
        <div role="alert" className="grid gap-3 rounded-[16px] border border-card-line bg-card px-4 py-5">
          <h1 className="text-[22px] font-bold">Couldn't reach the server</h1>
          <p className="text-[15px] text-glass-text/80">{error ?? 'Your account could not be loaded.'} Check that the backend is running.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void refresh()} className="rounded-full bg-chip px-4 py-2 font-semibold">
              Try again
            </button>
            {import.meta.env.DEV && (
              <>
                <a href="/preview/edition" className="text-[14px] font-semibold text-accent-text">
                  Newspaper preview
                </a>
                <a href="/dev" className="text-[14px] font-semibold text-accent-text">
                  Dev tools
                </a>
              </>
            )}
          </div>
        </div>
      </GlassPage>
    )
  }
  if (!profile.city) return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />
  return children
}
