import { RequestCache } from './requestCache'

const API_URL = (
  import.meta.env.VITE_API_URL?.trim() || (import.meta.env.PROD ? '/api' : 'http://localhost:8000')
).replace(/\/$/, '')
const responses = new RequestCache()

export function clearApiCache() {
  responses.clear()
}

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
  clearApiCache()
  getToken = getter
}

/** Fetch the backend with the signed-in user's Supabase Auth access token attached. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const read = (init.method ?? 'GET').toUpperCase() === 'GET'
  const request = async (): Promise<T> => {
    const res = await fetch(`${API_URL}${path}`, { ...init, headers })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) clearApiCache()
      const body = await res.json().catch(() => null)
      const detail = typeof body?.detail === 'string' ? body.detail : res.statusText
      throw new ApiError(res.status, detail)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  // Abortable requests belong to their caller; signed media URLs must always be fresh.
  if (
    read &&
    token &&
    !init.signal &&
    init.cache !== 'no-store' &&
    !path.includes('/audio') &&
    !path.includes('/images/')
  ) {
    const key = JSON.stringify([path, [...headers.entries()]])
    return responses.load(key, request, init.cache === 'reload' || init.cache === 'no-cache')
  }
  if (read) return request()
  clearApiCache()
  try {
    return await request()
  } finally {
    // Also discard reads that began while the write was in flight, even on ambiguous failures.
    clearApiCache()
  }
}
