import { createContext, useContext } from 'react'

export type AuthUser = { id: string; email: string; name: string; emailVerified: boolean }

export type AuthState = {
  /** False when VITE_SUPABASE_* is missing: login shows setup guidance. */
  configured: boolean
  loading: boolean
  passwordRecovery: boolean
  completePasswordRecovery: () => void
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
  passwordRecovery: false,
  completePasswordRecovery: noop,
  error: null,
  user: null,
  signIn: noop,
  signUp: noop,
  signOut: noop,
})

export const useAuth = () => useContext(AuthContext)
