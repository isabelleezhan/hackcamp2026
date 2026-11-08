import { createClient } from '@supabase/supabase-js'

// Capture the callback type before the SDK consumes and removes the URL fragment.
export const initialPasswordRecovery = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
export const supabaseConfigured = Boolean(url && key)
export const supabase = supabaseConfigured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null
