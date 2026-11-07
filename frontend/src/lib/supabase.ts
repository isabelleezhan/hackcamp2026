import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Keep the existing auth scaffold optional while the Auth0 frontend is integrated.
export const supabase = url && publicKey ? createClient(url, publicKey) : null
