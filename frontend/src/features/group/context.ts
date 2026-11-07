import { createContext, useContext } from 'react'
import type { Edition, Group, Member, Period } from '../../lib/types'

/** A member as the group screens need them: name, place, local time zone, notes this week. */
export type Person = {
  id: string
  name: string
  role: Member['role']
  city: string | null
  lat: number | null
  lng: number | null
  tz: string | null
  notes: number
}

export type GroupState = {
  group: Group
  people: Person[]
  meId: string
  isOrganizer: boolean
  period: Period | null
  latest: Edition | null
  refresh: () => Promise<void>
}

export const GroupContext = createContext<GroupState | null>(null)

export function useGroup() {
  const value = useContext(GroupContext)
  if (!value) throw new Error('useGroup must be used inside <GroupLayout>')
  return value
}
