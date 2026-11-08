// Auth0 settings from frontend/.env.local (see .env.example). All three are public values.
export const auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '',
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID?.trim() ?? '',
  // Must match the backend's AUTH0_AUDIENCE (the Auth0 API Identifier).
  audience: import.meta.env.VITE_AUTH0_AUDIENCE?.trim() ?? '',
}

/** Protected pages require Auth0 settings; previews and developer tools remain public. */
export const auth0Configured = Boolean(auth0Config.domain && auth0Config.clientId && auth0Config.audience)
