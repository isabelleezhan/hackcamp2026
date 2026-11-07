import { useState } from 'react'

export type EmailMessage = { from: string; to: string[]; subject: string; html: string; text: string }

/**
 * The edition email exactly as the backend builds it, shown in a mock inbox.
 * The HTML renders in a sandboxed iframe: no scripts can run, and links are inert.
 */
export default function EmailPreview({ email }: { email: EmailMessage }) {
  const [height, setHeight] = useState(900)
  const [plain, setPlain] = useState(false)

  return (
    <section aria-label="Edition email preview" className="grid gap-[14px]">
      <div className="overflow-hidden rounded-[14px] border border-card-line bg-card text-[14px]">
        {[
          ['From', email.from],
          ['To', email.to.join(', ')],
          ['Subject', email.subject],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-glass-line px-[14px] py-2.5 [&+&]:border-t">
            <span className="text-glass-muted">{label}</span>
            <span className={`min-w-0 break-words ${label === 'Subject' ? 'font-semibold' : ''}`}>{value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-glass-muted">This is the email people get when they turn on email. Links are disabled here.</p>
        <button
          type="button"
          onClick={() => setPlain((p) => !p)}
          className="shrink-0 rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {plain ? 'Show formatted' : 'Show plain text'}
        </button>
      </div>

      {plain ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-[14px] bg-card p-[18px] font-reading text-[15px] leading-[1.55] text-card-ink">
          {email.text}
        </pre>
      ) : (
        <iframe
          title="Edition email"
          srcDoc={email.html}
          // allow-same-origin (without allow-scripts) lets us measure the height; nothing can run.
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          className="w-full rounded-[14px] bg-[#e9e7e1]"
          style={{ height }}
          onLoad={(e) => {
            const doc = e.currentTarget.contentDocument
            if (doc) setHeight(doc.documentElement.scrollHeight + 4)
          }}
        />
      )}
    </section>
  )
}
