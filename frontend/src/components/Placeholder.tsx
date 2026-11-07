import type { ReactNode } from 'react'

/**
 * A page that isn't built yet. It says what belongs here so a teammate can pick it up.
 * Replace the whole component when you build the page.
 */
export default function Placeholder({
  title,
  ticket,
  file,
  purpose,
  todo,
  api = [],
  ready = [],
  children,
}: {
  title: string
  ticket?: string
  file: string
  purpose: string
  todo: string[]
  api?: string[]
  ready?: string[]
  children?: ReactNode
}) {
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-accent-text">Not built yet{ticket && ` · ${ticket}`}</p>
        <h2 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.01em]">{title}</h2>
        <p className="mt-1 text-[15px] text-glass-text/80">{purpose}</p>
      </div>
      <section className="rounded-[16px] border border-dashed border-accent bg-accent-soft/60 p-4 text-[14px]">
        <h3 className="font-bold">What goes here</h3>
        <ul className="mt-1.5 grid list-disc gap-1 pl-5">
          {todo.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {api.length > 0 && (
          <>
            <h3 className="mt-3 font-bold">API</h3>
            <ul className="mt-1.5 grid gap-1">
              {api.map((a) => (
                <li key={a}>
                  <code className="rounded bg-white/70 px-1.5 py-0.5 text-[12.5px]">{a}</code>
                </li>
              ))}
            </ul>
          </>
        )}
        {ready.length > 0 && (
          <>
            <h3 className="mt-3 font-bold">Already built to use</h3>
            <ul className="mt-1.5 grid list-disc gap-1 pl-5">
              {ready.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-[13px] text-glass-muted">
          Edit <code className="rounded bg-white/70 px-1.5 py-0.5">{file}</code>
        </p>
      </section>
      {children}
    </div>
  )
}
