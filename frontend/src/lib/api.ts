const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Set by <AuthProvider> once Supabase Auth is ready, so plain functions can attach the access token.
type TokenGetter = () => Promise<string | null>
let getToken: TokenGetter = async () => null

export function setTokenGetter(getter: TokenGetter) {
  getToken = getter
}

/** Fetch the backend with the signed-in user's Supabase Auth access token attached. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : res.statusText
    throw new ApiError(res.status, detail)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
