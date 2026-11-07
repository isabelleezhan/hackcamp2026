import { createContext, useContext } from 'react'

export type AuthUser = { email: string; name: string; emailVerified: boolean }

export type AuthState = {
  /** False when VITE_AUTH0_* is missing: the app runs without sign-in. */
  configured: boolean
  loading: boolean
  user: AuthUser | null
  signIn: (returnTo?: string) => void
  signUp: (returnTo?: string) => void
  signOut: () => void
}

const noop = () => {}

export const AuthContext = createContext<AuthState>({
  configured: false,
  loading: false,
  user: null,
  signIn: noop,
  signUp: noop,
  signOut: noop,
})

export const useAuth = () => useContext(AuthContext)
