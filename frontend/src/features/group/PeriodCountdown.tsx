import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { periodCountdownLabel } from '../../lib/time'
import type { Period } from '../../lib/types'

/** The clock is local to the header, so ticking does not rerender the globe. */
export default function PeriodCountdown({ period, refresh }: { period: Period; refresh: () => Promise<void> }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    let active = true
    let checking = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const deadline = new Date(period.deadline_at).getTime()

    function schedule() {
      if (!active) return
      clearTimeout(timer)
      // Wake at the deadline; retry while n8n is still closing this period.
      const delay = !period.closed_at && deadline > Date.now() ? Math.min(deadline - Date.now(), 60_000) : 5000
      timer = setTimeout(() => void check(false), delay)
    }

    async function check(force: boolean) {
      if (!active || checking) return
      if (document.hidden || (!force && !period.closed_at && Date.now() < deadline)) {
        schedule()
        return
      }
      checking = true
      try {
        const current = await api<Period>(`/groups/${period.group_id}/periods/current`, {
          cache: 'no-store', signal: controller.signal,
        })
        if (active && (current.id !== period.id || current.deadline_at !== period.deadline_at || current.closed_at !== period.closed_at)) {
          await refresh()
        }
      } catch {
        // Keep the closed state visible and retry after temporary network/worker delays.
      } finally {
        checking = false
        schedule()
      }
    }

    const onFocus = () => { setNow(Date.now()); void check(true) }
    schedule()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [period.group_id, period.id, period.deadline_at, period.closed_at, refresh])

  return <p className="text-[12.5px] font-semibold text-accent-text">{periodCountdownLabel(period, now)}</p>
}
