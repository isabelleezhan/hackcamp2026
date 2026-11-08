import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Avatar from '../../components/Avatar'
import { api } from '../../lib/api'
import type { GroupSummary } from '../../lib/types'

// Avatar button size, gap and padding in px: smaller on phones so the rail covers less globe.
const SIZES = { wide: { ITEM: 44, GAP: 10, PAD: 8 }, narrow: { ITEM: 36, GAP: 6, PAD: 5 } }

/**
 * Newsletter switcher: a vertical frosted-glass pill on the right edge. The active group sits on a
 * white "lens" that glides between items, in the spirit of a phone's bottom navigation bar.
 */
export default function GroupRail({
  activeId,
  narrow,
  sheetTop,
}: {
  activeId: string
  narrow: boolean
  /** On phones, where the bottom sheet starts (CSS length), so the rail stays above it. */
  sheetTop: string | null
}) {
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const { ITEM, GAP, PAD } = SIZES[narrow ? 'narrow' : 'wide']

  useEffect(() => {
    api<GroupSummary[]>('/groups')
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [activeId])

  const active = groups.findIndex((g) => g.id === activeId)

  return (
    <nav
      aria-label="Newsletters"
      style={narrow && sheetTop ? { maxHeight: `calc(${sheetTop} - 82px)` } : undefined}
      className={`absolute z-20 flex flex-col rounded-[30px] border border-white/80 bg-white/45 shadow-[0_18px_44px_rgba(36,56,92,.20),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-[26px] backdrop-saturate-[1.8] ${
        narrow
          ? 'right-[max(12px,env(safe-area-inset-right,0px))] top-[calc(env(safe-area-inset-top,0px)+66px)] overflow-hidden'
          : 'right-[max(14px,env(safe-area-inset-right,0px))] top-1/2 -translate-y-1/2'
      }`}
    >
      <ul className={`relative flex flex-col ${narrow ? 'overflow-y-auto overscroll-contain [scrollbar-width:none]' : ''}`} style={{ padding: PAD, gap: GAP }}>
        {active >= 0 && (
          <li
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-white shadow-[0_4px_14px_rgba(36,56,92,.18)] transition-transform duration-[420ms] ease-[cubic-bezier(.2,.9,.25,1.15)] motion-reduce:transition-none"
            style={{ left: PAD - 4, top: PAD - 4, width: ITEM + 8, height: ITEM + 8, transform: `translateY(${active * (ITEM + GAP)}px)` }}
          />
        )}
        {groups.map((g, i) => {
          const isActive = i === active
          return (
            <li key={g.id} className="group/item relative">
              <Link
                to={`/groups/${g.id}`}
                aria-label={g.name}
                aria-current={isActive ? 'page' : undefined}
                className="relative grid place-items-center rounded-full transition-transform duration-200 hover:scale-[1.07] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text motion-reduce:transition-none"
                style={{ width: ITEM, height: ITEM }}
              >
                <Avatar
                  id={g.id}
                  name={g.name}
                  className={`${narrow ? 'size-[30px]! text-[13px]!' : 'size-[38px]! text-[15px]!'} transition-[filter,opacity] duration-300 ${isActive ? '' : 'opacity-80 saturate-[.75] group-hover/item:opacity-100 group-hover/item:saturate-100'}`}
                />
              </Link>
              {!narrow && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute right-[calc(100%+14px)] top-1/2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-full bg-glass-text/85 px-3 py-1 text-[13px] font-semibold text-white opacity-0 backdrop-blur-md transition-[opacity,transform] duration-200 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100"
                >
                  {g.name}
                </span>
              )}
            </li>
          )
        })}
        <li className="group/item relative">
          <Link
            to="/groups"
            aria-label="New or join a newsletter"
            className="grid place-items-center rounded-full border-[1.5px] border-dashed border-glass-text/30 text-glass-muted transition-[transform,color,border-color] duration-200 hover:scale-[1.07] hover:border-glass-text/50 hover:text-glass-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            style={{ width: ITEM, height: ITEM }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          {!narrow && (
            <span
              role="tooltip"
              className="pointer-events-none absolute right-[calc(100%+14px)] top-1/2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-full bg-glass-text/85 px-3 py-1 text-[13px] font-semibold text-white opacity-0 transition-[opacity,transform] duration-200 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100"
            >
              New or join
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
