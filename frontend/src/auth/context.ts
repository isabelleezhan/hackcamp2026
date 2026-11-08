import { createContext, useContext } from 'react'

export type AuthUser = { email: string; name: string; emailVerified: boolean }

export type AuthState = {
  /** False when VITE_AUTH0_* is missing: login shows setup guidance. */
  configured: boolean
  loading: boolean
  error: string | null
  user: AuthUser | null
  signIn: (returnTo?: string) => void
  signUp: (returnTo?: string) => void
  signOut: () => void
}

const noop = () => {}

export const AuthContext = createContext<AuthState>({
  configured: false,
  loading: false,
  error: null,
  user: null,
  signIn: noop,
  signUp: noop,
  signOut: noop,
})

export const useAuth = () => useContext(AuthContext)
