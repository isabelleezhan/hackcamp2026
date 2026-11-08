import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import GlassPage from '../../components/GlassPage'
import { card, link } from '../../components/ui'
import { api, ApiError } from '../../lib/api'

/** "/join?code=…": the invite link. Joins (idempotent) and opens the group. */
export default function JoinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('code') ?? ''
  const [joinError, setJoinError] = useState<string | null>(null)
  const error = code ? joinError : 'This invite link is missing its code.'
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !code) return
    started.current = true
    api<{ id: string }>('/groups/join', { method: 'POST', body: JSON.stringify({ code }) })
      .then(({ id }) => navigate(`/groups/${id}`, { replace: true }))
      .catch((e) =>
        setJoinError(
          e instanceof ApiError && (e.status === 404 || e.status === 422)
            ? "This invite link doesn't match a group. Ask whoever invited you for a new one."
            : "Couldn't join right now. Check your connection and try the link again.",
        ),
      )
  }, [code, navigate])

  return (
    <GlassPage>
      <div className={`${card} mt-2 grid gap-2 p-5`} role={error ? 'alert' : 'status'}>
        <h1 className="text-[22px] font-bold">{error ? "Couldn't join this group" : 'Joining the group…'}</h1>
        {error && (
          <p className="text-[15px] text-glass-text/80">
            {error}{' '}
            <Link to="/groups" className={link}>
              Go to your groups
            </Link>
          </p>
        )}
      </div>
    </GlassPage>
  )
}
