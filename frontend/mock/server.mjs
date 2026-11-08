// Mock backend for frontend work: the same routes and shapes as the FastAPI backend, kept in
// memory, no sign-in, no database, no Gemini. Data resets when it restarts.
//
//   npm run mock-api            # http://localhost:8000 (what VITE_API_URL points at by default)
//   PORT=8787 npm run mock-api
//
// Seeded with "The Long-Distance Weekly": you (organizer) plus four friends, a published Issue 12,
// and an open week. "End week & publish" builds the next issue from the notes you add.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 8000)
const dir = new URL('../src/features/edition/', import.meta.url)
const sampleEdition = JSON.parse(readFileSync(new URL('sample-edition.json', dir)))
const sampleEmail = JSON.parse(readFileSync(new URL('sample-email.json', dir)))

const now = () => new Date().toISOString()
const DAY = 86400000
function localDay(timezone, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at).map(({ type, value }) => [type, value]))
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`)
}
function cutoffForDate(publication, timezone) {
  const wallClock = publication.getTime() - 60000 // Previous day, 23:59 in the group zone.
  let instant = wallClock
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant)).map(({ type, value }) => [type, value]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
    instant += wallClock - represented
  }
  return new Date(instant)
}
function nextCutoff(group) {
  const today = localDay(group.timezone)
  const step = group.publication_mode === 'interval' ? group.publication_interval_days : 7
  let publication
  if (group.publication_mode === 'interval') {
    const anchor = new Date(`${group.publication_anchor_date}T00:00:00Z`)
    publication = new Date(anchor.getTime() + Math.max(1, Math.floor((today - anchor) / DAY / step)) * step * DAY)
  } else {
    publication = new Date(today.getTime() + ((group.publication_weekday - (today.getUTCDay() + 6) % 7 + 7) % 7) * DAY)
  }
  let cutoff = cutoffForDate(publication, group.timezone)
  while (cutoff <= new Date()) {
    publication = new Date(publication.getTime() + step * DAY)
    cutoff = cutoffForDate(publication, group.timezone)
  }
  return cutoff.toISOString()
}

// ---------- seed ----------
const ME = 'u-me'
const profiles = {
  [ME]: { id: ME, email: 'you@example.com', display_name: 'You', location_mode: 'manual', city: 'Vancouver', lat: 49.3, lng: -123.1, timezone: 'America/Vancouver', location_updated_at: now() },
}
const friends = [
  ['b0000000-0000-4000-8000-000000000001', 'Jun', 'Toronto', 43.7, -79.4, 'America/Toronto'],
  ['b0000000-0000-4000-8000-000000000002', 'Bea', 'London', 51.5, -0.1, 'Europe/London'],
  ['b0000000-0000-4000-8000-000000000003', 'Priya', 'Bengaluru', 13.0, 77.6, 'Asia/Kolkata'],
  ['b0000000-0000-4000-8000-000000000004', 'Marisol', 'Mexico City', 19.4, -99.1, 'America/Mexico_City'],
]
for (const [id, name, city, lat, lng, tz] of friends) {
  profiles[id] = { id, email: `${name.toLowerCase()}@example.com`, display_name: name, location_mode: 'manual', city, lat, lng, timezone: tz, location_updated_at: now() }
}

const groups = {}
const memberships = [] // { group_id, user_id, role, email_enabled }
const periods = {} // id → period
const reflections = {} // id → note
const editions = {} // id → edition

function createGroup(name, timezone, ownerId, id = randomUUID()) {
  timezone = 'America/Vancouver'
  const code = Array.from({ length: 8 }, () => '23456789ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 31)]).join('')
  groups[id] = { id, name, join_code: code, timezone, created_by: ownerId, created_at: now(),
    publication_mode: 'weekly', publication_weekday: 6, publication_interval_days: null,
    publication_anchor_date: localDay(timezone).toISOString().slice(0, 10) }
  memberships.push({ group_id: id, user_id: ownerId, role: 'organizer', email_enabled: false })
  openPeriod(id)
  return groups[id]
}
function openPeriod(groupId, deadline = nextCutoff(groups[groupId])) {
  const id = randomUUID()
  periods[id] = { id, group_id: groupId, starts_at: now(), deadline_at: deadline, closed_at: null }
  return periods[id]
}
const currentPeriod = (gid) => Object.values(periods).find((p) => p.group_id === gid && !p.closed_at)

const seed = createGroup('The Long-Distance Weekly', 'America/Vancouver', ME, 'c0000000-0000-4000-8000-000000000001')
for (const [id] of friends) memberships.push({ group_id: seed.id, user_id: id, role: 'member', email_enabled: false })
editions[sampleEdition.id] = { ...sampleEdition, group_id: seed.id }
// Friends already wrote some notes this week (only counts are visible to you, as in the real app).
const seededCounts = { [friends[0][0]]: 3, [friends[1][0]]: 2 }

// ---------- helpers ----------
const membership = (gid, uid = ME) => memberships.find((m) => m.group_id === gid && m.user_id === uid)
const groupView = (g) => ({ ...g, membership: membership(g.id), invitation_url: `http://localhost:5173/join?code=${g.join_code}` })
const issuesOf = (gid) => Object.values(editions).filter((e) => e.group_id === gid).sort((a, b) => b.issue_number - a.issue_number)

function buildPaper(gid, notes) {
  const byUser = {}
  for (const n of notes) (byUser[n.user_id] ??= []).push(n)
  const updates = Object.entries(byUser).map(([uid, ns]) => {
    const p = profiles[uid]
    return {
      user_id: uid,
      display_name: p.display_name,
      headline: `${p.display_name}'s week`,
      text: ns.map((n) => n.body).join(' '),
      source_reflection_ids: ns.map((n) => n.id),
      dateline: ns.at(-1).city ?? p.city,
    }
  })
  return {
    headline: updates.length === 1 ? `${updates[0].display_name} wrote in this week` : `${updates.length} people wrote in this week`,
    introduction: '(Mock paper: the real backend asks Gemini to write this from everyone\'s notes.)',
    member_updates: updates,
    little_victories: [],
    looking_ahead: [],
  }
}

// ---------- routing ----------
const routes = []
const route = (method, pattern, handler) =>
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler })

route('GET', '/health', () => ({ status: 'ok' }))
route('GET', '/me', () => profiles[ME])
route('PATCH', '/me', ({ body }) => Object.assign(profiles[ME], body, 'city' in body || 'lat' in body ? { location_updated_at: now() } : {}))
// Profile photo: the real backend stores it privately and returns a signed link; the mock keeps a data URL.
route('POST', '/me/avatar', ({ raw, type }) => {
  const boundary = /boundary=(.+)$/.exec(type)?.[1]
  if (!boundary) return [422, { detail: 'Expected a file' }]
  const start = raw.indexOf('\r\n\r\n') + 4
  const end = raw.lastIndexOf(`\r\n--${boundary}`)
  const image = raw.subarray(start, end)
  const mime = image[0] === 0xff ? 'image/jpeg' : image[0] === 0x89 ? 'image/png' : null
  if (!mime) return [415, { detail: 'Choose a JPEG, PNG or WebP image' }]
  profiles[ME].avatar_url = `data:${mime};base64,${image.toString('base64')}`
  return profiles[ME]
})
route('DELETE', '/me/avatar', () => {
  profiles[ME].avatar_url = null
  return profiles[ME]
})
route('GET', '/geocode/reverse', ({ query }) => {
  const lat = Number(query.get('lat')), lng = Number(query.get('lng'))
  const known = [['Vancouver', 49.28, -123.12], ['Toronto', 43.65, -79.38], ['London', 51.51, -0.13], ['Lisbon', 38.72, -9.14], ['Tokyo', 35.68, 139.69]]
  const [city] = known.sort((a, b) => Math.hypot(a[1] - lat, a[2] - lng) - Math.hypot(b[1] - lat, b[2] - lng))[0]
  return { city, lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 }
})

route('GET', '/groups', () => memberships.filter((m) => m.user_id === ME).map((m) => ({ ...groups[m.group_id], membership: m })))
route('POST', '/groups', ({ body }) => [201, { id: createGroup(body.name, body.timezone ?? 'America/Vancouver', ME).id }])
route('POST', '/groups/join', ({ body }) => {
  const code = String(body.code ?? '').toUpperCase().replace(/[\s-]/g, '')
  const g = Object.values(groups).find((x) => x.join_code === code)
  if (!g) return [404, { detail: 'Invalid invitation' }]
  if (!membership(g.id)) memberships.push({ group_id: g.id, user_id: ME, role: 'member', email_enabled: false })
  return { id: g.id }
})
route('GET', '/groups/:gid', ({ p }) => groupView(groups[p.gid]))
route('PUT', '/groups/:gid/schedule', ({ p, body }) => {
  const group = groups[p.gid]
  if (!group) return [404, { detail: 'Group not found' }]
  if (membership(p.gid)?.role !== 'organizer') return [403, { detail: 'Organizer required' }]
  if (!(body.mode === 'weekly' && Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6 && body.interval_days == null) &&
      !(body.mode === 'interval' && Number.isInteger(body.interval_days) && body.interval_days >= 1 && body.interval_days <= 365 && body.weekday == null)) {
    return [422, { detail: 'Choose a weekday or 1–365 whole days.' }]
  }
  const changed = group.publication_mode !== body.mode || group.publication_weekday !== (body.weekday ?? null) || group.publication_interval_days !== (body.interval_days ?? null)
  if (changed) {
    Object.assign(group, { publication_mode: body.mode, publication_weekday: body.weekday ?? null,
      publication_interval_days: body.interval_days ?? null, publication_anchor_date: localDay(group.timezone).toISOString().slice(0, 10) })
    const period = currentPeriod(p.gid)
    if (period && new Date(period.deadline_at) > new Date()) period.deadline_at = nextCutoff(group)
  }
  return group
})
route('PATCH', '/groups/:gid', ({ p, body }) => {
  if (membership(p.gid).role !== 'organizer') return [403, { detail: 'Only organizers can rename the newsletter' }]
  const name = String(body.name ?? '').trim()
  if (!name) return [422, { detail: 'Enter a name' }]
  groups[p.gid].name = name.slice(0, 120)
  return groupView(groups[p.gid])
})
route('POST', '/groups/:gid/leave', ({ p }) => {
  const others = memberships.filter((m) => m.group_id === p.gid && m.user_id !== ME)
  if (membership(p.gid).role === 'organizer' && others.length && !others.some((m) => m.role === 'organizer'))
    return [409, { detail: "You're the only organizer. Delete the newsletter instead, or leave once everyone else has gone." }]
  memberships.splice(memberships.indexOf(membership(p.gid)), 1)
  if (!others.length) delete groups[p.gid]
  return [204, null]
})
route('DELETE', '/groups/:gid', ({ p }) => {
  if (membership(p.gid).role !== 'organizer') return [403, { detail: 'Only organizers can delete the newsletter' }]
  for (let i = memberships.length - 1; i >= 0; i--) if (memberships[i].group_id === p.gid) memberships.splice(i, 1)
  delete groups[p.gid]
  return [204, null]
})
route('PUT', '/groups/:gid/email-preference', ({ p, body }) => {
  membership(p.gid).email_enabled = Boolean(body.enabled)
  return { email_enabled: Boolean(body.enabled) }
})
route('GET', '/groups/:gid/members', ({ p }) =>
  memberships.filter((m) => m.group_id === p.gid).map((m) => {
    const { display_name, city, lat, lng, timezone, location_updated_at, avatar_url = null } = profiles[m.user_id]
    return { user_id: m.user_id, role: m.role, profiles: { display_name, city, lat, lng, timezone, location_updated_at, avatar_url } }
  }),
)
route('GET', '/groups/:gid/periods/current', ({ p }) => currentPeriod(p.gid) ?? [404, { detail: 'No open issue period' }])
route('GET', '/groups/:gid/periods/:pid/reflections', ({ p }) =>
  Object.values(reflections).filter((r) => r.period_id === p.pid && r.user_id === ME),
)
route('GET', '/groups/:gid/periods/:pid/note-counts', ({ p }) => {
  const counts = {}
  for (const r of Object.values(reflections)) if (r.period_id === p.pid && r.status === 'submitted') counts[r.user_id] = (counts[r.user_id] ?? 0) + 1
  if (p.gid === seed.id && currentPeriod(seed.id)?.id === p.pid) Object.assign(counts, { ...seededCounts, ...counts })
  return Object.entries(counts).map(([user_id, notes]) => ({ user_id, notes, audio_seconds: 0 }))
})
route('POST', '/groups/:gid/periods/:pid/reflections', ({ p, body }) => {
  const mine = Object.values(reflections).filter((r) => r.period_id === p.pid && r.user_id === ME)
  if (mine.length >= 30) return [429, { detail: "You've added 30 notes this week. That's the weekly limit." }]
  if (!body.body?.trim()) return [422, { detail: 'A note needs some text' }]
  const r = { id: randomUUID(), group_id: p.gid, period_id: p.pid, user_id: ME, status: body.status ?? 'draft', body: body.body,
    audio_path: body.audio_path ?? null, audio_duration_seconds: body.audio_duration_seconds ?? null,
    city: body.city ?? profiles[ME].city, lat: body.lat ?? null, lng: body.lng ?? null, recorded_at: now(), updated_at: now() }
  reflections[r.id] = r
  return [201, r]
})
route('PUT', '/groups/:gid/reflections/:rid', ({ p, body }) => {
  const r = reflections[p.rid]
  if (!r || r.user_id !== ME) return [404, { detail: 'Note not found' }]
  const { ai_consent: _consent, ...fields } = body
  return Object.assign(r, fields, { updated_at: now() })
})
route('DELETE', '/groups/:gid/reflections/:rid', ({ p }) => {
  delete reflections[p.rid]
  return [204, null]
})
route('POST', '/groups/:gid/audio', ({ p }) => ({
  audio_path: `${p.gid}/${ME}/${randomUUID()}.webm`,
  audio_duration_seconds: 42,
  transcript: '(Mock transcript) This week I finally fixed my bike and rode it to the market on Saturday.',
  status: 'review_required',
  detail: 'Review and edit the transcript before submitting your reflection.',
}))
route('GET', '/groups/:gid/audio-url', () => ({ url: 'about:blank', expires_in: 60 }))

route('POST', '/groups/:gid/publish', ({ p, body }) => {
  const m = membership(p.gid)
  if (m?.role !== 'organizer') return [403, { detail: 'Only organizers can publish or retry an edition' }]
  const period = periods[body.period_id]
  if (!period) return [404, { detail: 'Period not found' }]
  if (period.closed_at) {
    const existing = Object.values(editions).find((e) => e.period_id === period.id)
    return [202, { edition_id: existing?.id ?? null, status: existing ? 'queued' : 'empty' }]
  }
  period.closed_at = now()
  openPeriod(p.gid, new Date(period.deadline_at) > new Date() ? period.deadline_at : nextCutoff(groups[p.gid]))
  const notes = Object.values(reflections).filter((r) => r.period_id === period.id && r.status === 'submitted')
  if (!notes.length) return [202, { edition_id: null, status: 'empty' }]
  const id = randomUUID()
  const issue = (issuesOf(p.gid)[0]?.issue_number ?? 0) + 1
  editions[id] = { id, group_id: p.gid, period_id: period.id, issue_number: issue, status: 'generating', content: null, generation_error: null, generation_attempts: 1, published_at: null, created_at: now() }
  setTimeout(() => Object.assign(editions[id], { status: 'published', content: buildPaper(p.gid, notes), published_at: now() }), 4000)
  return [202, { edition_id: id, status: 'queued' }]
})
route('POST', '/groups/:gid/editions/:eid/retry', ({ p }) => [202, { edition_id: p.eid, status: 'queued' }])
route('GET', '/groups/:gid/editions', ({ p }) => issuesOf(p.gid))
route('GET', '/groups/:gid/editions/latest', ({ p }) => issuesOf(p.gid).find((e) => e.status === 'published') ?? [404, { detail: 'No published edition yet' }])
route('GET', '/groups/:gid/editions/:eid', ({ p }) => editions[p.eid] ?? [404, { detail: 'Edition not found' }])
route('GET', '/groups/:gid/editions/:eid/email-preview', ({ p }) => {
  const e = editions[p.eid]
  if (!e || e.status !== 'published') return [404, { detail: 'No published edition to preview' }]
  if (e.id === sampleEdition.id) return sampleEmail
  const g = groups[p.gid]
  const items = e.content.member_updates.map((u) => `<li><b>${u.display_name}</b>: ${u.headline}</li>`).join('')
  return { ...sampleEmail, subject: `${g.name}, Issue ${e.issue_number}: ${e.content.headline}`,
    html: `<div style="font-family:Georgia,serif;padding:24px"><h1>${e.content.headline}</h1><p>(Mock email; the real backend uses the full template.)</p><ul>${items}</ul></div>`,
    text: `${e.content.headline}\n\n(Mock email)` }
})
route('GET', '/groups/:gid/editions/:eid/delivery', () => ({ status: 'not_enrolled' }))

// ---------- server ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks)
  let body = {}
  if ((req.headers['content-type'] ?? '').includes('application/json') && raw.length) {
    try { body = JSON.parse(raw) } catch { body = {} }
  }
  for (const r of routes) {
    const m = r.method === req.method && url.pathname.match(r.re)
    if (!m) continue
    const groupId = m.groups?.gid
    if (groupId && !groups[groupId]) return send(res, 404, { detail: 'Group not found' })
    if (groupId && !membership(groupId) && !url.pathname.endsWith('/join')) return send(res, 404, { detail: 'Group not found' })
    const out = await r.handler({ p: m.groups ?? {}, body, query: url.searchParams, raw, type: req.headers['content-type'] ?? '' })
    const [status, payload] = Array.isArray(out) && typeof out[0] === 'number' ? out : [200, out]
    console.log(req.method, url.pathname, status)
    return send(res, status, payload)
  }
  console.log(req.method, url.pathname, 404)
  send(res, 404, { detail: 'Not found (mock API)' })
}).listen(PORT, () => console.log(`Mock API on http://localhost:${PORT} (in memory, resets on restart)`))

function send(res, status, payload) {
  res.writeHead(status, { ...CORS, ...(payload === null ? {} : { 'Content-Type': 'application/json' }) })
  res.end(payload === null ? undefined : JSON.stringify(payload))
}
