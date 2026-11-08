import type { Group } from './types'

/** Monday=0 ... Sunday=6, matching the backend. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function hourLabel(hour: number) {
  if (hour === 0) return 'midnight'
  if (hour === 12) return 'noon'
  return `${hour % 12 || 12} ${hour < 12 ? 'a.m.' : 'p.m.'}`
}

/** The group's release day and hour; groups from before the setting existed use Sunday 6 p.m. */
export function scheduleOf(group: Pick<Group, 'publish_weekday' | 'publish_hour'>) {
  return { weekday: group.publish_weekday ?? 6, hour: group.publish_hour ?? 18 }
}

/** "Sundays at 6 p.m. Pacific Standard Time" */
export function scheduleLabel(group: Pick<Group, 'publish_weekday' | 'publish_hour' | 'timezone'>) {
  const { weekday, hour } = scheduleOf(group)
  return `${WEEKDAYS[weekday]}s at ${hourLabel(hour)} ${zoneName(group.timezone)}`
}

export function zoneName(timeZone: string) {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? timeZone
    )
  } catch {
    return timeZone
  }
}

/** Every IANA time zone the browser knows, with the group's current one guaranteed to be listed. */
export function timeZones(current: string): string[] {
  let zones: string[] = []
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    zones = []
  }
  return zones.includes(current) ? zones : [current, ...zones]
}
