import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import GlassPage from '../../components/GlassPage'
import { card, input, label, primary, secondary, subtitle, title } from '../../components/ui'
import { approximateLocation } from '../../lib/location'
import { useProfile } from './context'

/** First run (and "Change location"): your name, and where you are, approximately. */
export default function Welcome() {
  const { profile, loading, update } = useProfile()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [name, setName] = useState(profile?.display_name ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [busy, setBusy] = useState<'locate' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (loading) return null
  if (!profile) return <Navigate to="/" replace />

  async function useMyLocation() {
    setBusy('locate')
    setError(null)
    try {
      const found = await approximateLocation()
      if (!found.city) {
        setError("We couldn't name a city for your location. Type it instead.")
        return
      }
      await update({
        display_name: name.trim() || profile!.display_name,
        location_mode: 'auto',
        city: found.city,
        lat: found.lat,
        lng: found.lng,
      })
      navigate(from, { replace: true })
    } catch (e) {
      const denied = e instanceof GeolocationPositionError && e.code === e.PERMISSION_DENIED
      setError(
        denied
          ? 'Location is turned off for this site. Type your city instead.'
          : "Couldn't get your location. Type your city instead.",
      )
    } finally {
      setBusy(null)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !city.trim()) return
    setBusy('save')
    setError(null)
    try {
      await update({ display_name: name.trim(), location_mode: 'manual', city: city.trim() })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassPage>
      <div className="grid gap-5 py-4">
        <div>
          <h1 className={title}>{profile.city ? 'Your details' : 'Welcome'}</h1>
          <p className={`${subtitle} mt-1`}>
            Your friends see your name and the city you're in, nothing more precise.
          </p>
        </div>

        <form onSubmit={save} className={`${card} grid gap-4 p-4`}>
          <div>
            <label htmlFor="display-name" className={label}>
              Your name
            </label>
            <input id="display-name" className={input} value={name} maxLength={80} required autoComplete="nickname"
              onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <span className={label}>Where are you?</span>
            <button type="button" className={primary} onClick={useMyLocation} disabled={busy !== null || !name.trim()}>
              {busy === 'locate' ? 'Finding your city…' : 'Use my approximate location'}
            </button>
            <p className="text-[13px] text-glass-muted">
              Rounded to about 10 km and updated only while you use the app. Never tracked in the background.
            </p>
          </div>

          <div className="flex items-center gap-3 text-[13px] text-glass-muted">
            <span className="h-px flex-1 bg-card-line" /> or <span className="h-px flex-1 bg-card-line" />
          </div>

          <div>
            <label htmlFor="city" className={label}>
              Type your city
            </label>
            <input id="city" className={input} value={city} maxLength={120} placeholder="Vancouver" autoComplete="address-level2"
              onChange={(e) => setCity(e.target.value)} />
          </div>
          <button type="submit" className={secondary} disabled={busy !== null || !name.trim() || !city.trim()}>
            {busy === 'save' ? 'Saving…' : 'Save and continue'}
          </button>

          {error && (
            <p role="alert" className="text-[14px] text-alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </GlassPage>
  )
}
