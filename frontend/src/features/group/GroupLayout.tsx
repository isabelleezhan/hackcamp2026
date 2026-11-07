import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useMatch, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../../lib/api'
import { timeUntil } from '../../lib/time'
import type { Edition, Group, Member, NoteCount, Period } from '../../lib/types'
import { useProfile } from '../account/context'
import { GroupContext, type GroupState, type Person } from './context'

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

const TABS: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  {
    to: '',
    label: 'People',
    end: true,
    icon: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21m0-18C9.5 5.6 8.3 8.6 8.3 12s1.2 6.4 3.7 9M3.5 9h17M3.5 15h17" />,
  },
  { to: 'week', label: 'This week', icon: <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0m6 6v3" /> },
  { to: 'paper', label: 'Paper', icon: <path d="M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Zm11 4h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3" /> },
  { to: 'editions', label: 'Issues', icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { to: 'settings', label: 'Group', icon: <path d="M16 19v-1a4 4 0 0 0-8 0v1m4-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 1a2.5 2.5 0 1 0 0-5m2 12v-1a3.5 3.5 0 0 0-2.5-3.4" /> },
]

function TabBar() {
  return (
    <nav aria-label="Group" className="grid grid-cols-5 border-t border-glass-line bg-white/60 px-1 pb-[calc(env(safe-area-inset-bottom,0px)+4px)] pt-1">
      {TABS.map((t) => (
        <NavLink
          key={t.label}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `grid justify-items-center gap-0.5 rounded-[12px] py-1.5 text-[11.5px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text ${
              isActive ? 'text-accent-text' : 'text-glass-muted hover:text-glass-text'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
              {t.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** /groups/:groupId/*: the globe behind, one frosted sheet with the active tab, and the tab bar. */
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

  const refresh = useCallback(async () => {
    try {
      const [g, m, p] = await Promise.all([
        api<Group>(`/groups/${groupId}`),
        api<Member[]>(`/groups/${groupId}/members`),
        api<Period>(`/groups/${groupId}/periods/current`).catch(() => null),
      ])
      const [c, l] = await Promise.all([
        p ? api<NoteCount[]>(`/groups/${groupId}/periods/${p.id}/note-counts`).catch(() => []) : Promise.resolve([]),
        api<Edition>(`/groups/${groupId}/editions/latest`).catch(() => null),
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
    void refresh()
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
      notes: byUser.get(m.user_id) ?? 0,
    }))
    // You first, then everyone else alphabetically.
    return list.sort((a, b) => (a.id === profile?.id ? -1 : b.id === profile?.id ? 1 : a.name.localeCompare(b.name)))
  }, [members, counts, profile?.id])

  const value = useMemo<GroupState | null>(
    () =>
      group && profile
        ? {
            group,
            people,
            meId: profile.id,
            isOrganizer: group.membership?.role === 'organizer',
            period,
            latest,
            refresh,
          }
        : null,
    [group, profile, people, period, latest, refresh],
  )

  const select = (id: string | null) => navigate(id ? `/groups/${groupId}/people/${id}` : `/groups/${groupId}`)

  return (
    <main className="sky fixed inset-0 overflow-hidden font-system text-[15px] leading-[1.45] text-glass-text antialiased">
      {value && (
        <div className={narrow ? 'absolute inset-x-0 top-0 h-[46%]' : 'absolute inset-0'}>
          <Suspense fallback={null}>
            <GlobeView people={people} meId={value.meId} selectedId={selectedId} onSelect={select} sheet={narrow ? 'bottom' : 'left'} />
          </Suspense>
        </div>
      )}

      <section
        aria-label={group?.name ?? 'Group'}
        className={`absolute z-10 flex flex-col overflow-hidden border border-white/90 bg-glass shadow-[0_24px_60px_rgba(36,56,92,.18),0_2px_6px_rgba(36,56,92,.06)] backdrop-blur-[22px] backdrop-saturate-[1.4] ${
          narrow
            ? 'inset-x-0 bottom-0 h-[58%] rounded-t-[22px] border-b-0'
            : 'bottom-[14px] left-[max(14px,env(safe-area-inset-left,0px))] top-[calc(env(safe-area-inset-top,0px)+14px)] w-[400px] rounded-[22px]'
        }`}
      >
        {narrow && <div aria-hidden="true" className="mx-auto mt-2 h-[5px] w-9 flex-none rounded-full bg-glass-text/20" />}
        <header className="flex flex-none items-center justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0">
            <Link to="/" className="text-[13px] font-semibold text-accent-text">
              ‹ All groups
            </Link>
            <h1 className="truncate text-[19px] font-extrabold tracking-[-0.01em]">{group?.name ?? ' '}</h1>
          </div>
          {period && (
            <p className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent-text">
              Closes in {timeUntil(period.deadline_at)}
            </p>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-1">
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
        <TabBar />
      </section>
    </main>
  )
}
