import AudioTranscription from '../components/AudioTranscription'
import EmailTest from '../components/EmailTest'
import { useAuth } from '../auth/context'

/** /dev: Jerry's testing panels (audio transcription, email delivery). Not part of the product. */
export default function DevTools() {
  const { configured, user } = useAuth()
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="border-b-4 border-double border-ink pb-3">
        <h1 className="font-display text-3xl font-black">Developer tools</h1>
        <p className="mt-1 text-sm text-stone-600">
          {user ? `Signed in as ${user.email}.` : configured ? 'Not signed in.' : 'Sign-in not configured (no VITE_AUTH0_*).'}
        </p>
      </header>
      <AudioTranscription />
      <EmailTest />
    </main>
  )
}
