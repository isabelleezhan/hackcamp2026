/** The public site, used for links people share. Override with VITE_PUBLIC_APP_URL. */
const DEPLOYED_URL = 'https://whydidmyfriendsleaveme.vercel.app'

function publicOrigin() {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  if (configured) return configured.replace(/\/$/, '')
  const { origin, hostname } = window.location
  // A localhost link only works on this computer, so share the deployed site instead.
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost')
  return local ? DEPLOYED_URL : origin
}

/** Invite link for a newsletter's join code, on whichever public site this app is served from. */
export function inviteUrl(joinCode: string) {
  return `${publicOrigin()}/join?code=${encodeURIComponent(joinCode)}`
}
