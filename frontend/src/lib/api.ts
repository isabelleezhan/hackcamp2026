import { supabase } from './supabase'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fetch the backend with the signed-in user's Supabase token attached. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const headers = new Headers(init.headers)
  if (session) headers.set('Authorization', `Bearer ${session.access_token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? res.statusText)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
