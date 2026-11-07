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
  const h = Math.floor(ms / 36e5)
  const d = Math.floor(h / 24)
  const m = Math.floor(ms / 6e4) % 60
  if (d >= 1) return `${d} day${d > 1 ? 's' : ''} ${h % 24} hr`
  return h ? `${h} hr ${m} min` : `${m} min`
}

/** "Sunday at 6 p.m." in the group's time zone. */
export function deadlineLabel(iso: string, tz?: string | null) {
  const d = new Date(iso)
  return `${weekday(tz, d)} at ${localTime(tz, d).replace(':00', '')}`
}

export function shortStamp(iso: string, tz?: string | null) {
  const d = new Date(iso)
  return `${new Intl.DateTimeFormat('en-US', { timeZone: tzOk(tz), weekday: 'short' }).format(d)} ${localTime(tz, d)}`
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
