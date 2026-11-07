import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/context'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (!supabase || session) return <Navigate to={from} replace />

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
    // On success onAuthStateChange sets the session and the <Navigate> above redirects.
  }

  const input =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 focus:border-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-800/20'
  const button =
    'w-full rounded-md bg-ink px-4 py-2 font-medium text-paper hover:bg-stone-700 disabled:opacity-50'

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-4">
      <h1 className="font-display text-4xl font-black">Community Newspaper</h1>
      <p className="mt-2 font-serif text-stone-600">Your week, in print.</p>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-8 space-y-3">
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input id="email" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={input} />
          <button type="submit" disabled={busy} className={button}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-8 space-y-3">
          <label htmlFor="code" className="block text-sm font-medium">
            Code sent to {email}
          </label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code}
            onChange={(e) => setCode(e.target.value)} className={`${input} tracking-widest`} />
          <button type="submit" disabled={busy} className={button}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" onClick={() => setStep('email')} className="text-sm text-stone-600 underline">
            Use a different email
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </main>
  )
}
