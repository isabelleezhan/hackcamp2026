import { createContext, useContext } from 'react'
import type { Profile } from '../../lib/types'

export type ProfileState = {
  profile: Profile | null
  loading: boolean
  error: string | null
  /** Partial update via PATCH /me; resolves with the saved profile. */
  update: (changes: Partial<Profile>) => Promise<Profile>
  refresh: () => Promise<void>
}

export const ProfileContext = createContext<ProfileState>({
  profile: null,
  loading: true,
  error: null,
  update: async () => {
    throw new Error('ProfileProvider missing')
  },
  refresh: async () => {},
})

export const useProfile = () => useContext(ProfileContext)
