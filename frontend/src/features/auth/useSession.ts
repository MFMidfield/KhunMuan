import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface SessionState {
  session: Session | null
  loading: boolean
}

/** The Supabase auth session. Staff only — customers never sign in. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true })

  useEffect(() => {
    let alive = true

    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setState({ session: data.session, loading: false })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ session, loading: false })
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}
