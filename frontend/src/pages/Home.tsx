import { useEffect, useState } from 'react'
import AudioTranscription from '../components/AudioTranscription'
import EmailTest from '../components/EmailTest'
import { useAuth } from '../auth/context'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

/** Placeholder home: proves sign-in works end to end (frontend → backend /me). Replace with the group list. */
export default function Home() {
  const { session } = useAuth()
  const [backend, setBackend] = useState<string>('checking…')

  useEffect(() => {
    if (!supabase) return
    api<{ email: string }>('/me')
      .then((me) => setBackend(`backend sees you as ${me.email}`))
      .catch((e: Error) => setBackend(`backend error: ${e.message}`))
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex items-baseline justify-between border-b-4 border-double border-ink pb-3">
        <h1 className="font-display text-3xl font-black">Community Newspaper</h1>
        {supabase && <button onClick={() => supabase?.auth.signOut()} className="text-sm underline">
          Sign out
        </button>}
      </header>
      {supabase && <>
        <p className="mt-6 font-serif">Signed in as {session?.user.email}.</p>
        <p className="mt-1 text-sm text-stone-600">{backend}</p>
      </>}
      <AudioTranscription />
      <EmailTest />
    </main>
  )
}
