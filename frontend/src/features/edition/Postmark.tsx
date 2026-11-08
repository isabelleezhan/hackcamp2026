import { useId } from 'react'

/**
 * A postal cancellation stamp for the masthead: the issue number around the top, the
 * publication city around the bottom, the date in the middle, and wavy cancel lines beside it.
 * Decorative: the same facts are already in the masthead text.
 */
export default function Postmark({ issue, iso, timeZone = 'America/Vancouver' }: { issue: number; iso: string | null; timeZone?: string }) {
  const id = useId().replace(/:/g, '')
  const date = iso ? new Date(iso) : null
  const month = date ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(date).toUpperCase() : ''
  const year = date ? new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(date) : ''
  const city = (timeZone.split('/').pop() ?? '').replace(/_/g, ' ').toUpperCase()

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 150 92"
      width="118"
      height="72"
      className="pointer-events-none -rotate-[9deg] text-accent-text opacity-75 mix-blend-multiply"
    >
      <defs>
        <path id={`${id}-top`} d="M 48 46 m -30 0 a 30 30 0 1 1 60 0" />
        <path id={`${id}-bottom`} d="M 48 46 m -31 0 a 31 31 0 0 0 62 0" />
      </defs>
      <g fill="none" stroke="currentColor">
        <circle cx="48" cy="46" r="40" strokeWidth="2.2" />
        <circle cx="48" cy="46" r="23" strokeWidth="1.2" />
        {/* Cancellation waves, running off to the right like a franking machine's. */}
        {[30, 40, 50, 60].map((y) => (
          <path key={y} d={`M 92 ${y} q 7 -5 14 0 t 14 0 t 14 0 t 14 0`} strokeWidth="2" strokeLinecap="round" />
        ))}
      </g>
      <g fill="currentColor" fontFamily="var(--font-system)" fontWeight="800" letterSpacing="1.6">
        <text fontSize="7.4" letterSpacing="1">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            MAILBUDS NO. {issue}
          </textPath>
        </text>
        <text fontSize="7.4" letterSpacing="1.2" dominantBaseline="hanging">
          <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">
            {city}
          </textPath>
        </text>
        <text x="48" y="45" fontSize="10.5" textAnchor="middle" letterSpacing=".4">
          {month}
        </text>
        <text x="48" y="56" fontSize="8.5" textAnchor="middle" fontWeight="700" letterSpacing=".6">
          {year}
        </text>
      </g>
    </svg>
  )
}
