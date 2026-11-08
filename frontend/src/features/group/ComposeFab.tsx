import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import WeekTab from './WeekTab'

type Mode = 'voice' | 'write'

const MIC = (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
  </svg>
)
const PENCIL = (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const OPTIONS: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  { mode: 'write', label: 'Write note', icon: PENCIL },
  { mode: 'voice', label: 'Transcribe', icon: MIC },
]

/** Old /week links open the composer instead. */
export function ComposeRedirect() {
  const { groupId = '' } = useParams()
  return <Navigate to={{ pathname: `/groups/${groupId}`, search: '?compose=write' }} replace />
}

/**
 * Bottom-right button. It fans out to the left into "Transcribe" (microphone) and "Write note"
 * (pencil); either opens this week's notes in a frosted panel (?compose=voice|write).
 */
export default function ComposeFab({ narrow }: { narrow: boolean }) {
  const [params, setParams] = useSearchParams()
  const compose = params.get('compose')
  const mode: Mode | null = compose === 'voice' || compose === 'write' ? compose : null
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const fab = useRef<HTMLButtonElement>(null)

  function choose(next: Mode | null) {
    setOpen(false)
    setParams(
      (p) => {
        const q = new URLSearchParams(p)
        if (next) q.set('compose', next)
        else q.delete('compose')
        return q
      },
      { replace: !next },
    )
    if (!next) fab.current?.focus()
  }

  // Escape closes the menu, then the panel.
  useEffect(() => {
    if (!open && !mode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (open) setOpen(false)
      else choose(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // Once this week's notes have loaded, jump to the right part of the composer.
  useEffect(() => {
    if (!mode) return
    let frame = 0
    const started = performance.now()
    const seek = () => {
      const root = panel.current
      const el =
        mode === 'write'
          ? root?.querySelector<HTMLTextAreaElement>('#weekly-note-body')
          : root?.querySelector<HTMLElement>('[aria-label="Voice note"]')
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        if (mode === 'write') el.focus({ preventScroll: true })
        else {
          el.classList.add('compose-flash')
          setTimeout(() => el.classList.remove('compose-flash'), 1400)
        }
      } else if (performance.now() - started < 6000) frame = requestAnimationFrame(seek)
    }
    frame = requestAnimationFrame(seek)
    return () => cancelAnimationFrame(frame)
  }, [mode])

  return (
    <>
      {mode && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-label={mode === 'voice' ? 'Record a voice note' : 'Write a note'}
          className={`compose-in absolute z-30 flex flex-col overflow-hidden border border-white/90 bg-glass shadow-[0_24px_60px_rgba(36,56,92,.24)] backdrop-blur-[22px] backdrop-saturate-[1.4] ${
            narrow
              ? 'inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top,0px)+40px)] rounded-t-[22px]'
              : 'bottom-[88px] right-[max(14px,env(safe-area-inset-right,0px))] max-h-[calc(100%-110px)] w-[min(460px,calc(100%-28px))] rounded-[22px]'
          }`}
        >
          <header className="flex flex-none items-center justify-between gap-2 px-4 pb-2 pt-3">
            <div role="tablist" aria-label="How to add" className="flex gap-0.5 rounded-[12px] bg-chip p-0.5">
              {OPTIONS.slice()
                .reverse()
                .map((o) => (
                  <button
                    key={o.mode}
                    type="button"
                    role="tab"
                    aria-selected={mode === o.mode}
                    onClick={() => choose(o.mode)}
                    className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[14px] font-semibold transition-colors ${
                      mode === o.mode ? 'bg-white text-glass-text shadow-[0_1px_4px_rgba(36,56,92,.15)]' : 'text-glass-muted hover:text-glass-text'
                    }`}
                  >
                    {o.icon}
                    {o.label}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => choose(null)}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full text-glass-muted hover:bg-chip hover:text-glass-text focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          <div className={`min-h-0 flex-1 overflow-y-auto px-4 pt-1 ${narrow ? 'pb-28' : 'pb-5'}`}>
            <WeekTab />
          </div>
        </div>
      )}

      <div
        className={`absolute bottom-[max(16px,env(safe-area-inset-bottom,0px))] right-[max(14px,env(safe-area-inset-right,0px))] z-40 flex flex-row-reverse items-center gap-2.5`}
      >
        <button
          ref={fab}
          type="button"
          aria-label={open ? 'Close' : mode ? 'Close note' : 'Add a note'}
          aria-expanded={open}
          aria-controls="compose-options"
          onClick={() => (mode && !open ? choose(null) : setOpen((o) => !o))}
          className="grid size-[58px] place-items-center rounded-full bg-accent text-accent-ink shadow-[0_12px_28px_rgba(240,96,79,.40),0_2px_6px_rgba(36,56,92,.12)] transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className={`transition-transform duration-300 ease-[cubic-bezier(.2,.9,.25,1.2)] motion-reduce:transition-none ${open || mode ? 'rotate-45' : ''}`}
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <ul id="compose-options" className="flex flex-row-reverse items-center gap-2">
          {OPTIONS.map((o, i) => (
            <li
              key={o.mode}
              className="transition-[opacity,transform] duration-300 ease-[cubic-bezier(.2,.9,.25,1.15)] motion-reduce:transition-none"
              style={{
                opacity: open ? 1 : 0,
                transform: open ? 'translateX(0) scale(1)' : `translateX(${24 + i * 30}px) scale(.85)`,
                transitionDelay: open ? `${i * 55}ms` : '0ms',
                pointerEvents: open ? 'auto' : 'none',
              }}
            >
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                aria-hidden={!open}
                onClick={() => choose(o.mode)}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/90 bg-white/70 py-2.5 pl-3.5 pr-4 text-[15px] font-bold text-glass-text shadow-[0_10px_26px_rgba(36,56,92,.18)] backdrop-blur-[22px] backdrop-saturate-[1.6] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
              >
                <span className={`grid size-8 place-items-center rounded-full ${o.mode === 'voice' ? 'bg-accent-soft text-accent-text' : 'bg-blue-soft text-blue'}`}>{o.icon}</span>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
