import { useEffect, useState } from 'react'
import { SEALED } from '../../lib/mailEvents'

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A saved note folds into an airmail envelope, gets a heart seal and flies off toward the globe.
 * Purely decorative (the composer already says "Note saved"), and skipped with reduced motion.
 */
export default function SealAnimation() {
  const [run, setRun] = useState(0)

  useEffect(() => {
    const on = () => {
      if (!reduceMotion()) setRun((n) => n + 1)
    }
    addEventListener(SEALED, on)
    return () => removeEventListener(SEALED, on)
  }, [])

  useEffect(() => {
    if (!run) return
    const t = setTimeout(() => setRun(0), 2000)
    return () => clearTimeout(t)
  }, [run])

  if (!run) return null
  return (
    <div key={run} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
      <svg viewBox="-4 -40 128 144" width="150" height="169" overflow="visible" className="seal-fly">
        {/* Envelope back */}
        <rect x="0" y="20" width="120" height="80" rx="6" fill="#f4f8fd" />
        {/* Open flap, behind the letter */}
        <path className="seal-flap-open" d="M0 22 L60 -20 L120 22 Z" fill="#e3f0ff" stroke="#c9ddf3" strokeLinejoin="round" />
        {/* The note */}
        <g className="seal-letter">
          <rect x="12" y="-8" width="96" height="70" rx="3" fill="#fff" stroke="#d6e3f2" />
          {[6, 16, 26, 36].map((y, i) => (
            <rect key={y} x="22" y={y} width={i === 3 ? 44 : 76} height="3.5" rx="1.75" fill="#c9ddf3" />
          ))}
        </g>
        {/* Front pocket with an airmail border */}
        <path d="M0 26 L60 66 L120 26 L120 94 Q120 100 114 100 L6 100 Q0 100 0 94 Z" fill="#fff" stroke="#e3f0ff" />
        <rect x="2" y="22" width="116" height="76" rx="5" fill="none" stroke="#4a9be8" strokeWidth="3.5" strokeDasharray="8 8" />
        <rect x="2" y="22" width="116" height="76" rx="5" fill="none" stroke="#f07a73" strokeWidth="3.5" strokeDasharray="8 8" strokeDashoffset="8" />
        {/* Flap folding shut, then the seal */}
        <path className="seal-flap" d="M0 21 L60 62 L120 21 Z" fill="#e3f0ff" stroke="#c9ddf3" strokeLinejoin="round" />
        <g className="seal-wax">
          <circle cx="60" cy="62" r="11" fill="#f07a73" stroke="#fff" strokeWidth="2.5" />
          <path d="M60 67.5c-4.6-3-7-5.4-7-8.2a3.6 3.6 0 0 1 7-1.2 3.6 3.6 0 0 1 7 1.2c0 2.8-2.4 5.2-7 8.2Z" fill="#fff" />
        </g>
      </svg>
    </div>
  )
}
