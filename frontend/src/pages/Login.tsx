import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import GlassPage, { pillButton } from '../components/GlassPage'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup' | 'forgot' | 'reset'
export default function Login() {
  const { configured, loading, user, error: sessionError, signOut, passwordRecovery, completePasswordRecovery } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { from?: string; mode?: Mode; reauthenticate?: boolean } | null
  const target = state?.from ?? '/groups'
  const from = target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login') ? target : '/groups'
  const resetting = passwordRecovery || new URLSearchParams(location.search).get('reset') === '1'
  const [mode, setMode] = useState<Mode>(state?.mode ?? 'signin')
  const currentMode = resetting ? 'reset' : mode
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  if (loading) return <GlassPage><p role="status">Loading your session...</p></GlassPage>
  if (user?.emailVerified && !resetting && (!state?.reauthenticate || submitted)) return <Navigate to={from} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(null); setMessage(null)
    const redirectTo = `${window.location.origin}/login`
    try {
      if (currentMode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } })
        if (authError) throw authError
        if (!data.session) { setConfirmation(true); setMessage('Check your email for a confirmation link. Existing accounts can sign in instead.') }
        else { setSubmitted(true); navigate(from, { replace: true }) }
      } else if (currentMode === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
        if (authError) throw authError
        setMessage('If an account exists for that address, a password reset link has been requested.')
      } else if (currentMode === 'reset') {
        const { error: authError } = await supabase.auth.updateUser({ password })
        if (authError) throw authError
        completePasswordRecovery()
        navigate(from, { replace: true })
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
        setSubmitted(true); navigate(from, { replace: true })
      }
      setPassword('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.') }
    finally { setBusy(false) }
  }
  const title = currentMode === 'signup' ? 'Create an account' : currentMode === 'forgot' ? 'Reset password' : currentMode === 'reset' ? 'Set a new password' : 'Sign in'
  return <GlassPage><div className="grid gap-5 py-6 sm:max-w-sm">
    <div><h1 className="text-[28px] font-extrabold">MailBuds</h1><p className="mt-1 text-glass-muted">A few lines from everyone, every week.</p></div>
    <h2 className="text-xl font-bold">{title}</h2>
    {!configured && <p role="alert">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local, then restart the frontend.</p>}
    <form onSubmit={submit} className="grid gap-3">
      {currentMode !== 'reset' && <label className="grid gap-1">Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="rounded-xl border border-card-line bg-card p-3" /></label>}
      {currentMode !== 'forgot' && <label className="grid gap-1">Password<input required type="password" minLength={currentMode === 'signin' ? undefined : 8} autoComplete={currentMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} className="rounded-xl border border-card-line bg-card p-3" /></label>}
      <button disabled={busy || !configured} className={`${pillButton} bg-accent py-3 text-accent-ink`}>{busy ? 'Please wait...' : title}</button>
    </form>
    {(error || sessionError) && <p role="alert">{error ?? sessionError}</p>}
    {message && <p role="status">{message}</p>}
    {confirmation && <button type="button" disabled={busy} className={`${pillButton} bg-chip`} onClick={async () => {
      if (!supabase) return
      setBusy(true); setError(null)
      try {
        const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/login` } })
        if (resendError) throw resendError
        setMessage('Confirmation email requested. Check your inbox and spam folder.')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resend email.') }
      finally { setBusy(false) }
    }}>Resend confirmation email</button>}
    <div className="flex flex-wrap gap-3">
      {!resetting && <><button type="button" disabled={busy} className="font-semibold text-accent-text" onClick={() => { setMode(currentMode === 'signup' ? 'signin' : 'signup'); setError(null); setMessage(null); setConfirmation(false) }}>{currentMode === 'signup' ? 'Already have an account? Sign in' : 'Create an account'}</button><button type="button" disabled={busy} onClick={() => { setMode(currentMode === 'forgot' ? 'signin' : 'forgot'); setError(null); setMessage(null) }}>{currentMode === 'forgot' ? 'Back to sign in' : 'Forgot password?'}</button></>}
      {user && <button type="button" onClick={signOut}>Sign out</button>}
    </div>
  </div></GlassPage>
}
