// Shapes returned by the FastAPI backend. Keep in sync with backend/app/models and main.py.

export type Story = {
  headline: string
  text: string
  source_reflection_ids: string[]
}

export type MemberUpdate = Story & {
  user_id: string
  display_name: string
  dateline?: string | null
}

/** editions.content: Gemini's structured output after backend validation. */
export type Newspaper = {
  headline: string
  introduction: string
  member_updates: MemberUpdate[]
  little_victories: Story[]
  looking_ahead: Story[]
}

export type EditionStatus = 'pending' | 'generating' | 'published' | 'failed'

export type Edition = {
  id: string
  group_id: string
  period_id: string
  issue_number: number
  status: EditionStatus
  content: Newspaper | null
  generation_error: string | null
  generation_attempts: number
  published_at: string | null
  created_at: string
}

export type Group = {
  id: string
  name: string
  join_code: string
  timezone: string
  created_by: string
  created_at: string
  invitation_url: string
  membership: { group_id: string; user_id: string; role: 'organizer' | 'member'; email_enabled: boolean }
}

export type Profile = {
  id: string
  email: string
  display_name: string
  location_mode: 'auto' | 'manual' | null
  city: string | null
  lat: number | null
  lng: number | null
  timezone: string | null
  location_updated_at: string | null
}

export type GroupSummary = Omit<Group, 'invitation_url'>

export type Member = {
  user_id: string
  role: 'organizer' | 'member'
  profiles: Pick<Profile, 'display_name' | 'city' | 'lat' | 'lng' | 'timezone' | 'location_updated_at'> | null
}

export type Period = {
  id: string
  group_id: string
  starts_at: string
  deadline_at: string
  closed_at: string | null
}

export type NoteCount = { user_id: string; notes: number; audio_seconds: number }

export type ReflectionImage = {
  id: string
  reflection_id: string
  storage_path: string
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  caption: string
  created_at: string
}

/** A note ("reflection" in the API). Many per person per week. */
export type Reflection = {
  id: string
  body: string
  status: 'draft' | 'submitted'
  audio_path: string | null
  audio_duration_seconds: number | null
  recorded_at: string
  city: string | null
  lat: number | null
  lng: number | null
  updated_at: string
  /** Embedded on reflection-list responses; create/update responses may omit the relationship. */
  reflection_images?: ReflectionImage[]
}

export type AudioResult = {
  audio_path: string
  audio_duration_seconds: number
  transcript: string | null
  status: 'review_required' | 'transcription_failed'
  detail: string
}

export type PublishResult = { edition_id: string | null; status: 'queued' | 'empty' }
