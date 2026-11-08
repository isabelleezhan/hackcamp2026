import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import GlassPage from '../../components/GlassPage'
import { card, input, label, primary, secondary, subtitle, title } from '../../components/ui'
import { approximateLocation } from '../../lib/location'
import type { Profile } from '../../lib/types'
import CityPicker, { type CityMatch } from './CityPicker'
import { useProfile } from './context'

/** First run (and "Change location"): your name, and where you are, approximately. */
export default function Welcome() {
  const { profile, loading } = useProfile()
  if (loading) return null
  if (!profile) return <Navigate to="/" replace />
  // Build the form only once the profile has loaded, so the fields start with saved values.
  return <WelcomeForm key={profile.id} profile={profile} />
}

function WelcomeForm({ profile }: { profile: Profile }) {
  const { update } = useProfile()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [name, setName] = useState(profile?.display_name ?? '')
  // Already placed on the map? Keep that unless they pick a new city.
  const [picked, setPicked] = useState<CityMatch | null>(
    profile?.city && profile.lat != null && profile.lng != null
      ? { city: profile.city, label: profile.city, lat: profile.lat, lng: profile.lng }
      : null,
  )
  const [busy, setBusy] = useState<'locate' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        display_name: name.trim() || profile.display_name,
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
    if (!name.trim()) return
    if (!picked) {
      setError('Pick your city from the suggestions so you show up on the globe.')
      return
    }
    setBusy('save')
    setError(null)
    try {
      await update({
        display_name: name.trim(),
        location_mode: 'manual',
        city: picked.city,
        lat: picked.lat,
        lng: picked.lng,
      })
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
              Choose your city
            </label>
            <CityPicker
              initialText={profile.city ?? ''}
              value={picked}
              onChange={setPicked}
              disabled={busy !== null}
            />
          </div>
          <button type="submit" className={secondary} disabled={busy !== null || !name.trim() || !picked}>
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
