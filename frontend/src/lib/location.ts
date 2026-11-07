import { api } from './api'

export type ApproxLocation = { city: string | null; lat: number; lng: number }

/**
 * Approximate location: the browser position rounded to 2 decimals (~1 km) is sent to the
 * backend's city lookup, which returns lat/lng rounded to 1 decimal (~10 km) for storage.
 * Rejects if the person declines or the browser can't tell.
 */
export function approximateLocation(): Promise<ApproxLocation> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Math.round(pos.coords.latitude * 100) / 100
        const lng = Math.round(pos.coords.longitude * 100) / 100
        try {
          resolve(await api<ApproxLocation>(`/geocode/reverse?lat=${lat}&lng=${lng}`))
        } catch (e) {
          reject(e)
        }
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    )
  })
}
