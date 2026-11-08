import { useEffect, useId, useRef, useState } from 'react'
import { input } from '../../components/ui'
import { api } from '../../lib/api'

export type CityMatch = { city: string; label: string; lat: number; lng: number }

/**
 * Type a city, pick it from the suggestions. Picking gives approximate coordinates (~10 km),
 * which is what puts you on the globe. `value` is null until a suggestion is chosen.
 */
export default function CityPicker({
  initialText,
  value,
  onChange,
  disabled,
}: {
  initialText: string
  value: CityMatch | null
  onChange: (match: CityMatch | null) => void
  disabled?: boolean
}) {
  const [text, setText] = useState(initialText)
  const [matches, setMatches] = useState<CityMatch[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [state, setState] = useState<'idle' | 'searching' | 'none' | 'error'>('idle')
  const listId = useId()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => {
    clearTimeout(timer.current)
    request.current?.abort()
  }, [])

  function search(q: string) {
    clearTimeout(timer.current)
    request.current?.abort()
    setMatches([])
    setOpen(false)
    setActive(0)
    if (q.trim().length < 2) {
      setState('idle')
      return
    }
    // Wait for a pause in typing: the city lookup allows about one request a second.
    timer.current = setTimeout(async () => {
      const controller = new AbortController()
      request.current = controller
      setState('searching')
      try {
        const found = await api<CityMatch[]>(`/geocode/search?q=${encodeURIComponent(q.trim())}`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setMatches(found)
        setActive(0)
        setOpen(true)
        setState(found.length ? 'idle' : 'none')
      } catch {
        if (!controller.signal.aborted) setState('error')
      }
    }, 450)
  }

  function choose(match: CityMatch) {
    onChange(match)
    setText(match.label)
    setOpen(false)
    setMatches([])
  }

  const showList = open && matches.length > 0

  return (
    <div className="relative">
      <input
        id="city"
        className={input}
        value={text}
        maxLength={120}
        placeholder="Start typing, then pick your city"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value)
          if (value) onChange(null)
          search(e.target.value)
        }}
        onFocus={() => matches.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, matches.length - 1))
          else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
          else if (e.key === 'Enter') choose(matches[active])
          else if (e.key === 'Escape') setOpen(false)
          else return
          e.preventDefault()
        }}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[12px] border border-card-line bg-white shadow-[0_12px_30px_rgba(36,56,92,.16)]"
        >
          {matches.map((m, i) => (
            <li
              key={m.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(m)
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3.5 py-2.5 text-[15px] ${i === active ? 'bg-accent-soft' : ''}`}
            >
              <span className="font-semibold">{m.city}</span>
              <span className="text-glass-muted">{m.label.slice(m.city.length)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[13px] text-glass-muted" aria-live="polite">
        {value
          ? `You'll appear near ${value.label} on the globe.`
          : state === 'searching'
            ? 'Looking up cities…'
            : state === 'none'
              ? 'No cities found. Check the spelling or try a nearby bigger city.'
              : state === 'error'
                ? "Couldn't look up cities right now. Try again in a moment."
                : 'Pick your city from the list so you show up on the globe.'}
      </p>
    </div>
  )
}
