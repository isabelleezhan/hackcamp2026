import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Starfield background with one frosted-glass sheet, matching the globe prototype. */
export default function GlassPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="sky min-h-svh px-0 font-system text-[15px] leading-[1.45] text-glass-text antialiased sm:px-6 sm:py-8">
      <div
        className={`mx-auto min-h-svh border-glass-line bg-glass px-4 pb-10 pt-[calc(env(safe-area-inset-top,0px)+16px)] shadow-[0_24px_60px_rgba(36,56,92,.18),0_2px_6px_rgba(36,56,92,.06)] backdrop-blur-[28px] backdrop-saturate-[1.6] sm:min-h-0 sm:rounded-[22px] sm:border sm:px-6 sm:pt-5 ${
          wide ? 'max-w-[52rem]' : 'max-w-[44rem]'
        }`}
      >
        {children}
      </div>
    </main>
  )
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[16px] text-accent-text focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
    >
      <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
        <path d="M8 2L2 8l6 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  )
}

export const pillButton =
  'inline-flex items-center justify-center rounded-full px-4 py-2.5 font-system text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:cursor-not-allowed disabled:opacity-40'
