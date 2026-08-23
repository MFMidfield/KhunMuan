import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Failing loudly at boot beats a hundred confusing 401s later.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    // Staff sessions only. Customers never sign in — they place orders through
    // a public RPC and track them by code.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
