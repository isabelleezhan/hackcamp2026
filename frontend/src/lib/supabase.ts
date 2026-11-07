import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Used for auth only. All data goes through the FastAPI backend (RLS blocks direct reads).
// Without credentials the audio prototype works without sign-in.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
