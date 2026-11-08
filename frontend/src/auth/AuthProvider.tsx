import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, useLocation, useNavigate } from 'react-router'
import GlassPage, { pillButton } from '../components/GlassPage'
import { ApiError, clearApiCache, setTokenGetter } from '../lib/api'
import { initialPasswordRecovery, supabase, supabaseConfigured } from '../lib/supabase'
import { AuthContext, useAuth, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [passwordRecovery, setPasswordRecovery] = useState(initialPasswordRecovery)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useLayoutEffect(() => {
    setTokenGetter(async () => {
      if (!supabase) return null
      const { data, error: tokenError } = await supabase.auth.getSession()
      if (tokenError) throw new ApiError(401, 'Your session expired. Please sign in again.')
      return data.session?.access_token ?? null
    })
    return () => setTokenGetter(async () => null)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    let eventReceived = false
    let accountId: string | null = null
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (accountId !== (next?.user.id ?? null) || event === 'SIGNED_OUT') clearApiCache()
      accountId = next?.user.id ?? null
      eventReceived = true
      setSession(next)
      setLoading(false)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setError(null)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
    })
    void supabase.auth.getSession().then(({ data, error: initError }) => {
      if (!active) return
      if (!eventReceived) setSession(data.session)
      setError(initError?.message ?? null)
      setLoading(false)
    }).catch(() => {
      if (active) { setError('Could not restore your session.'); setLoading(false) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthState>(() => ({
    configured: supabaseConfigured,
    passwordRecovery,
    completePasswordRecovery: () => setPasswordRecovery(false),
    loading,
    error,
    user: session ? {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.user_metadata?.display_name ?? session.user.email ?? '',
      emailVerified: Boolean(session.user.email_confirmed_at),
    } : null,
    signIn: (returnTo = '/') => {
      if (!supabase) return
      void supabase.auth.signOut({ scope: 'local' }).then(({ error: logoutError }) => {
        if (logoutError) { setError(logoutError.message); return }
        setSession(null)
        setPasswordRecovery(false)
        navigate('/login', { state: { from: returnTo, reauthenticate: true } })
      }).catch(() => setError('Could not reset your session. Please try again.'))
    },
    signUp: (returnTo = '/') => navigate('/login', { state: { from: returnTo, mode: 'signup' } }),
    signOut: () => {
      if (!supabase) return
      void supabase.auth.signOut({ scope: 'local' }).then(({ error: logoutError }) => {
        if (logoutError) { setError(logoutError.message); return }
        setSession(null)
        setPasswordRecovery(false)
        navigate('/login', { replace: true })
      }).catch(() => setError('Could not sign out. Please try again.'))
    },
  }), [session, loading, error, navigate, passwordRecovery])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { configured, loading, user, signOut, passwordRecovery } = useAuth()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (loading) return <GlassPage><p role="status">Signing you in...</p></GlassPage>
  if (passwordRecovery) return <Navigate to="/login?reset=1" replace />
  if (!configured || !user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!user.emailVerified) return (
    <GlassPage><div className="grid gap-3">
      <h1 className="text-[22px] font-bold">Verify your email</h1>
      <p>Open the confirmation link for {user.email}, then sign in again.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} className={`${pillButton} bg-chip`} onClick={() => {
        if (!supabase) return
        setBusy(true)
        void supabase.auth.resend({ type: 'signup', email: user.email, options: { emailRedirectTo: `${window.location.origin}/login` } })
          .then(({ error: resendError }) => setError(resendError?.message ?? 'Confirmation email requested. Check your inbox and spam folder.'))
          .catch(() => setError('Could not resend the email.'))
          .finally(() => setBusy(false))
      }}>Resend confirmation email</button>
      <button type="button" className={`${pillButton} bg-chip`} onClick={signOut}>Sign out</button>
    </div></GlassPage>
  )
  return children
}
