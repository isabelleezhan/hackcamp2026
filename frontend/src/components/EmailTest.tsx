import { useRef, useState, type FormEvent } from 'react'
import { api } from '../lib/api'

export default function EmailTest() {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('Test email from Community Newspaper')
  const [message, setMessage] = useState('Hello! This is a test email from Community Newspaper.')
  const [pdf, setPdf] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [emailId, setEmailId] = useState('')
  const requestKey = useRef<string | null>(null)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setEmailId('')
    if (pdf && pdf.size > 10 * 1024 * 1024) {
      setError('The PDF must be 10 MB or smaller.')
      return
    }
    setBusy(true)
    try {
      requestKey.current ??= crypto.randomUUID()
      const body = new FormData()
      body.append('to', to.trim())
      body.append('subject', subject.trim())
      body.append('message', message)
      body.append('idempotency_key', requestKey.current)
      if (pdf) body.append('pdf', pdf)
      const result = await api<{ id: string }>('/email/test', { method: 'POST', body })
      setEmailId(result.id)
      requestKey.current = null
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The email could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'mt-1 w-full rounded border border-stone-400 bg-white px-3 py-2'

  return (
    <section className="mt-8 border-t border-stone-300 pt-6" aria-labelledby="email-heading">
      <h2 id="email-heading" className="font-display text-2xl font-bold">Test email delivery</h2>
      <p className="mt-2 text-sm text-stone-600">
        Send an email through Resend, with an optional PDF attachment. Clicking send emails the recipient immediately.
      </p>
      <p className="mt-2 text-sm text-stone-600">
        Using the onboarding@resend.dev test sender? Enter the email address associated with your Resend account.
      </p>
      <form
        className="mt-4"
        onSubmit={send}
        onChange={() => {
          requestKey.current = null
          setEmailId('')
          setError('')
        }}
      >
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
          <label htmlFor="test-email-to" className="block text-sm font-medium">
            Recipient email
            <input id="test-email-to" type="email" required maxLength={320} autoComplete="email"
              value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} />
          </label>
          <label htmlFor="test-email-subject" className="block text-sm font-medium">
            Subject
            <input id="test-email-subject" required maxLength={200}
              value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} />
          </label>
          <label htmlFor="test-email-message" className="block text-sm font-medium">
            Message
            <textarea id="test-email-message" required rows={4} maxLength={20000}
              value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} />
          </label>
          <label htmlFor="test-email-pdf" className="block text-sm font-medium">
            PDF attachment (optional, up to 10 MB)
            <input id="test-email-pdf" type="file" accept=".pdf,application/pdf"
              onChange={(event) => setPdf(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm file:mr-3 file:rounded file:border file:px-3 file:py-2" />
          </label>
          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50">
            {busy ? 'Sending…' : 'Send test email'}
          </button>
        </fieldset>
      </form>
      <p role="status" className="mt-3 text-sm text-stone-600">
        {busy ? 'Sending your email…' : emailId ? `Resend accepted the email. ID: ${emailId}. Check the recipient inbox or spam folder.` : ''}
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  )
}
