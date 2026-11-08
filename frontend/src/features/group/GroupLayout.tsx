import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, NavLink, Outlet, useMatch, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../../lib/api'
import { timeUntil } from '../../lib/time'
import type { Edition, Group, Member, NoteCount, Period } from '../../lib/types'
import { useProfile } from '../account/context'
import ComposeFab from './ComposeFab'
import { GroupContext, type GroupState, type Person } from './context'
import GroupRail from './GroupRail'

const GlobeView = lazy(() => import('../globe/GlobeView'))

function useNarrow() {
  const query = '(max-width: 759px)'
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

/** A number remembered in this browser (sheet size, collapsed state). Storage may be unavailable. */
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode: fine to forget */
    }
  }, [key, value])
  return [value, setValue] as const
}

const MIN_W = 320
const MAX_W = 680
const clampW = (w: number) => Math.round(Math.min(Math.max(w, MIN_W), Math.min(MAX_W, innerWidth * 0.62)))
const MIN_H = 30 // % of screen height on phones
const MAX_H = 88
const PEEK = 112 // px shown when collapsed on phones (header + tabs)

/** Weekly news | People: the only two tabs in the sheet. */
function SheetTabs() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-[9px] px-3 py-1.5 text-center text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text ${
      isActive ? 'bg-white text-glass-text shadow-[0_1px_4px_rgba(36,56,92,.15)]' : 'text-glass-muted hover:text-glass-text'
    }`
  const peopleActive = useMatch('/groups/:groupId/people/*')
  const settingsActive = useMatch('/groups/:groupId/settings')
  return (
    <nav aria-label="Sections" className="mx-4 mb-2 grid flex-none grid-cols-2 gap-0.5 rounded-[12px] bg-chip p-0.5">
      {/* Weekly news covers the index, past issues and single issues. */}
      <NavLink to="" end className={() => tab({ isActive: !peopleActive && !settingsActive })}>
        News
      </NavLink>
      <NavLink to="people" className={tab}>
        People
      </NavLink>
    </nav>
  )
}

const iconButton =
  'grid size-9 shrink-0 place-items-center rounded-full text-glass-muted hover:bg-chip hover:text-glass-text focus-visible:outline-2 focus-visible:outline-accent-text'

/** /groups/:groupId/*: globe behind; a resizable, collapsible frosted sheet; newsletter rail; compose button. */
export default function GroupLayout() {
  const { groupId = '' } = useParams()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const narrow = useNarrow()
  const personMatch = useMatch('/groups/:groupId/people/:userId')
  const selectedId = personMatch?.params.userId ?? null

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [period, setPeriod] = useState<Period | null>(null)
  const [counts, setCounts] = useState<NoteCount[]>([])
  const [latest, setLatest] = useState<Edition | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [width, setWidth] = useStored('sheet:width', 400)
  const [heightPct, setHeightPct] = useStored('sheet:height', 58)
  const [collapsed, setCollapsed] = useStored('sheet:collapsed', false)
  const drag = useRef<{ startX: number; startY: number; start: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  const refresh = useCallback(async (force = true) => {
    const options: RequestInit = force ? { cache: 'reload' } : {}
    try {
      const [g, m, p] = await Promise.all([
        api<Group>(`/groups/${groupId}`, options),
        api<Member[]>(`/groups/${groupId}/members`, options),
        api<Period>(`/groups/${groupId}/periods/current`, options).catch(() => null),
      ])
      const [c, l] = await Promise.all([
        p ? api<NoteCount[]>(`/groups/${groupId}/periods/${p.id}/note-counts`, options).catch(() => []) : Promise.resolve([]),
        api<Edition>(`/groups/${groupId}/editions/latest`, options).catch(() => null),
      ])
      setGroup(g)
      setMembers(m)
      setPeriod(p)
      setCounts(c)
      setLatest(l)
      setError(null)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "This group doesn't exist, or you're not a member."
          : "Couldn't load this group. Check your connection and refresh.",
      )
    }
  }, [groupId])

  useEffect(() => {
    void refresh(false)
  }, [refresh])

  const people = useMemo<Person[]>(() => {
    const byUser = new Map(counts.map((c) => [c.user_id, c.notes]))
    const list = members.map((m) => ({
      id: m.user_id,
      name: m.user_id === profile?.id ? 'You' : (m.profiles?.display_name ?? 'Member'),
      role: m.role,
      city: m.profiles?.city ?? null,
      lat: m.profiles?.lat ?? null,
      lng: m.profiles?.lng ?? null,
      tz: m.profiles?.timezone ?? null,
      photo: m.profiles?.avatar_url ?? null,
      notes: byUser.get(m.user_id) ?? 0,
    }))
    // You first, then everyone else alphabetically.
    return list.sort((a, b) => (a.id === profile?.id ? -1 : b.id === profile?.id ? 1 : a.name.localeCompare(b.name)))
  }, [members, counts, profile?.id])

  const value = useMemo<GroupState | null>(
    () =>
      group && profile
        ? { group, people, meId: profile.id, isOrganizer: group.membership?.role === 'organizer', period, latest, refresh }
        : null,
    [group, profile, people, period, latest, refresh],
  )

  const select = (id: string | null) => navigate(id ? `/groups/${groupId}/people/${id}` : `/groups/${groupId}/people`)

  // Drag the sheet's edge (desktop) or handle (phone) to resize; a tap on the phone handle toggles.
  function startDrag(e: ReactPointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, start: narrow ? heightPct : width, moved: false }
  }
  function onDrag(e: ReactPointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (!d.moved) return
    setDragging(true)
    if (narrow) {
      if (collapsed) setCollapsed(false)
      setHeightPct(Math.round(Math.min(MAX_H, Math.max(MIN_H, d.start - (dy / innerHeight) * 100))))
    } else {
      setWidth(clampW(d.start + dx))
    }
  }
  function endDrag() {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (d && !d.moved && narrow) setCollapsed((c) => !c)
  }
  function resizeWithKeys(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 48 : 16
    if (narrow) {
      if (e.key === 'ArrowUp') setHeightPct((h) => Math.min(MAX_H, h + 4))
      else if (e.key === 'ArrowDown') setHeightPct((h) => Math.max(MIN_H, h - 4))
      else if (e.key === 'Enter' || e.key === ' ') setCollapsed((c) => !c)
      else return
    } else {
      if (e.key === 'ArrowRight') setWidth((w) => clampW(w + step))
      else if (e.key === 'ArrowLeft') setWidth((w) => clampW(w - step))
      else return
    }
    e.preventDefault()
  }

  const sheetStyle = narrow
    ? { height: collapsed ? PEEK : `${heightPct}%` }
    : { width: clampW(width) }
  // Phones: the globe fills the space above the bottom sheet.
  // Desktop: the globe keeps its full size and glides sideways to stay centred in the space
  // beside the sidebar. Moving it (a GPU transform) is smooth; resizing the 3D canvas isn't.
  // Collapsing never resizes the 3D canvas (that's what made it glitch): on phones the globe keeps
  // the open-sheet height and just slides down into the freed space.
  const globeBox = narrow
    ? {
        top: 0,
        left: 0,
        right: 0,
        height: `${100 - heightPct}%`,
        transform: collapsed ? `translateY(calc((${heightPct}vh - ${PEEK}px) / 2))` : 'translateY(0)',
        willChange: 'transform',
      }
    : {
        inset: 0,
        transform: `translateX(${collapsed ? 0 : Math.round((clampW(width) - 24) / 2)}px)`,
        willChange: 'transform',
      }

  return (
    <main className="sky fixed inset-0 overflow-hidden font-system text-[15px] leading-[1.45] text-glass-text antialiased">
      {value && (
        <div
          className="absolute motion-safe:transition-transform motion-safe:duration-[650ms] motion-safe:ease-[cubic-bezier(.22,.8,.3,1)]"
          style={globeBox}
        >
          <Suspense fallback={null}>
            <GlobeView
              people={people}
              meId={value.meId}
              selectedId={selectedId}
              onSelect={select}
              sheet={narrow ? 'bottom' : 'none'}
            />
          </Suspense>
        </div>
      )}

      {/* Collapsed on desktop: a small frosted tab brings the sheet back. */}
      {!narrow && (
        <button
          tabIndex={collapsed ? 0 : -1}
          aria-hidden={!collapsed}
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show panel"
          className={`absolute left-[max(14px,env(safe-area-inset-left,0px))] top-[calc(env(safe-area-inset-top,0px)+14px)] z-10 flex items-center gap-2 rounded-full transition-[opacity,translate] duration-300 motion-reduce:transition-none ${
            collapsed ? 'opacity-100 delay-200' : 'pointer-events-none -translate-x-2 opacity-0'
          } border border-white/90 bg-glass py-2 pl-3 pr-4 text-[14px] font-semibold shadow-[0_12px_30px_rgba(36,56,92,.18)] backdrop-blur-[22px] backdrop-saturate-[1.4] hover:bg-white/90`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {group?.name ?? 'Panel'}
        </button>
      )}

      <section
        aria-label={group?.name ?? 'Group'}
        inert={!narrow && collapsed}
        aria-hidden={!narrow && collapsed}
        style={sheetStyle}
        className={`absolute z-10 flex flex-col overflow-hidden border border-white/90 bg-glass shadow-[0_24px_60px_rgba(36,56,92,.18),0_2px_6px_rgba(36,56,92,.06)] backdrop-blur-[22px] backdrop-saturate-[1.4] motion-reduce:transition-none ${
          dragging ? '' : 'transition-[height,translate,opacity] duration-500 ease-[cubic-bezier(.22,.8,.3,1)]'
        } ${!narrow && collapsed ? 'pointer-events-none -translate-x-[calc(100%+28px)] opacity-0' : ''} ${
          narrow
            ? 'inset-x-0 bottom-0 rounded-t-[22px] border-b-0'
            : 'bottom-[14px] left-[max(14px,env(safe-area-inset-left,0px))] top-[calc(env(safe-area-inset-top,0px)+14px)] rounded-[22px]'
        }`}
      >
        {narrow && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={collapsed ? 'Expand panel' : 'Resize or collapse panel'}
            tabIndex={0}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={resizeWithKeys}
            className="flex h-6 flex-none cursor-row-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text"
          >
            <span className="h-[5px] w-10 rounded-full bg-glass-text/25" />
          </div>
        )}
        <header className={`flex flex-none items-center justify-between gap-2 px-4 pb-2 ${narrow ? 'pt-0' : 'pt-3'}`}>
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-extrabold tracking-[-0.01em]">{group?.name ?? ' '}</h1>
            {period && <p className="text-[12.5px] font-semibold text-accent-text">Closes in {timeUntil(period.deadline_at)}</p>}
          </div>
          <div className="flex shrink-0 items-center">
            <Link to="settings" aria-label="Group settings" className={iconButton}>
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
              aria-expanded={!collapsed}
              className={iconButton}
            >
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {narrow ? <path d={collapsed ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /> : <path d="m15 6-6 6 6 6" />}
              </svg>
            </button>
          </div>
        </header>
        <SheetTabs />
        <div className={`min-h-0 flex-1 overflow-y-auto px-4 pt-1 ${narrow ? 'pb-28' : 'pb-5'}`}>
          {error ? (
            <div role="alert" className="rounded-[16px] border border-card-line bg-card p-4">
              <h2 className="text-[18px] font-bold">Group not available</h2>
              <p className="mt-1 text-[15px] text-glass-text/80">{error}</p>
              <Link to="/" className="mt-3 inline-block font-semibold text-accent-text">
                Go to your groups
              </Link>
            </div>
          ) : !value ? (
            <p role="status" className="text-[15px] text-glass-muted">
              Loading the group…
            </p>
          ) : (
            <GroupContext.Provider value={value}>
              <Outlet />
            </GroupContext.Provider>
          )}
        </div>
        {!narrow && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuenow={clampW(width)}
            aria-valuemin={MIN_W}
            aria-valuemax={MAX_W}
            tabIndex={0}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={resizeWithKeys}
            onDoubleClick={() => setWidth(400)}
            title="Drag to resize. Double-click to reset."
            className="group absolute inset-y-6 right-0 w-3 cursor-col-resize touch-none focus-visible:outline-none"
          >
            <span className="absolute inset-y-[45%] right-1 w-1 rounded-full bg-glass-text/15 transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
          </div>
        )}
      </section>

      <GroupRail activeId={groupId} narrow={narrow} sheetTop={narrow ? (collapsed ? `calc(100% - ${PEEK}px)` : `${100 - heightPct}%`) : null} />
      {value && (
        <GroupContext.Provider value={value}>
          <ComposeFab narrow={narrow} lift={narrow && collapsed ? PEEK : 0} />
        </GroupContext.Provider>
      )}
    </main>
  )
}
