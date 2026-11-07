import { Auth0Provider, useAuth0, type AppState } from '@auth0/auth0-react'
import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import GlassPage, { pillButton } from '../components/GlassPage'
import { setTokenGetter } from '../lib/api'
import { auth0Config, auth0Configured } from '../lib/auth0'
import { AuthContext, useAuth, type AuthState } from './context'

/**
 * Auth0 Universal Login. The backend accepts Auth0 access tokens for AUTH0_AUDIENCE with
 * `openid profile email`, and requires a verified email address.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  if (!auth0Configured) {
    return <AuthContext.Provider value={unconfigured}>{children}</AuthContext.Provider>
  }
  return (
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: auth0Config.audience,
        scope: 'openid profile email',
      }}
      // Keeps people signed in across reloads, including Safari (needs refresh token rotation
      // enabled on the Auth0 application and "Allow Offline Access" on the API).
      useRefreshTokens
      cacheLocation="localstorage"
      onRedirectCallback={(state?: AppState) => navigate(state?.returnTo ?? '/', { replace: true })}
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  )
}

const unconfigured: AuthState = {
  configured: false,
  loading: false,
  user: null,
  signIn: () => {},
  signUp: () => {},
  signOut: () => {},
}

function Auth0Bridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()

  // Layout effect: runs before children's effects, so their first API calls carry the token.
  useLayoutEffect(() => {
    setTokenGetter(async () => {
      if (!isAuthenticated) return null
      try {
        return (await getAccessTokenSilently()) || null
      } catch {
        return null // expired session: the API answers 401 and the page asks to sign in again
      }
    })
  }, [isAuthenticated, getAccessTokenSilently])

  const value = useMemo<AuthState>(
    () => ({
      configured: true,
      loading: isLoading,
      user:
        isAuthenticated && user
          ? {
              email: user.email ?? '',
              name: user.name ?? user.nickname ?? user.email ?? '',
              emailVerified: user.email_verified === true,
            }
          : null,
      signIn: (returnTo = '/') => void loginWithRedirect({ appState: { returnTo } }),
      signUp: (returnTo = '/') =>
        void loginWithRedirect({ appState: { returnTo }, authorizationParams: { screen_hint: 'signup' } }),
      signOut: () => void logout({ logoutParams: { returnTo: window.location.origin } }),
    }),
    [isLoading, isAuthenticated, user, loginWithRedirect, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Wrap routes that need a signed-in user with a verified email. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { configured, loading, user, signIn, signOut } = useAuth()
  const location = useLocation()
  if (!configured) return children
  if (loading) {
    return (
      <GlassPage>
        <p role="status" className="text-[15px] text-glass-muted">
          Signing you in…
        </p>
      </GlassPage>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!user.emailVerified) {
    return (
      <GlassPage>
        <div className="grid gap-3 rounded-[14px] border border-card-line bg-card px-4 py-5">
          <h1 className="text-[22px] font-bold leading-tight">Check your email</h1>
          <p className="text-[15px] text-glass-text/80">
            We sent a verification link to <b className="text-glass-text">{user.email}</b>. Open it, then come
            back and continue.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${pillButton} bg-accent text-accent-ink`}
              onClick={() => signIn(location.pathname + location.search)}
            >
              I've verified my email
            </button>
            <button type="button" className={`${pillButton} bg-chip`} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </GlassPage>
    )
  }
  return children
}
