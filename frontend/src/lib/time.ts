const tzOk = (tz?: string | null) => {
  if (!tz) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return undefined
  }
}

/** "4:28 p.m." in someone's own time zone. */
export function localTime(tz?: string | null, date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tzOk(tz), hour: 'numeric', minute: '2-digit' })
    .format(date)
    .replace(' AM', ' a.m.')
    .replace(' PM', ' p.m.')
}

export function weekday(tz?: string | null, date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tzOk(tz), weekday: 'long' }).format(date)
}

/** "1 day 4 hr", "3 hr 10 min", "12 min". */
export function timeUntil(iso: string, now = Date.now()) {
  const ms = Math.max(0, new Date(iso).getTime() - now)
  const minutes = Math.ceil(ms / 6e4)
  const h = Math.floor(minutes / 60)
  const d = Math.floor(h / 24)
  const m = minutes % 60
  if (d >= 1) return `${d} day${d > 1 ? 's' : ''} ${h % 24} hr`
  return h ? `${h} hr ${m} min` : `${m} min`
}

export function periodCountdownLabel(period: { deadline_at: string; closed_at: string | null }, now = Date.now()) {
  return period.closed_at || new Date(period.deadline_at).getTime() <= now
    ? 'Notes closed · awaiting publication'
    : `Closes in ${timeUntil(period.deadline_at, now)}`
}

/** The note cutoff in the group's time zone, e.g. "Saturday at 11:59 p.m.". */
export function deadlineLabel(iso: string, tz?: string | null) {
  const d = new Date(iso)
  return `${weekday(tz, d)} at ${localTime(tz, d).replace(':00', '')}`
}

export function shortStamp(iso: string, tz?: string | null) {
  const d = new Date(iso)
  return `${new Intl.DateTimeFormat('en-US', { timeZone: tzOk(tz), weekday: 'short' }).format(d)} ${localTime(tz, d)}`
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
