import Placeholder from '../../components/Placeholder'
import { deadlineLabel, timeUntil } from '../../lib/time'
import { useGroup } from './context'

/** /groups/:groupId/week: write and record this week's notes; organizers publish. */
export default function WeekTab() {
  const { group, period, isOrganizer } = useGroup()
  return (
    <Placeholder
      title="This week"
      ticket="FE-2 and FE-6"
      file="frontend/src/features/group/WeekTab.tsx"
      purpose={
        period
          ? `Your notes for this week. The week closes ${deadlineLabel(period.deadline_at, group.timezone)} (in ${timeUntil(period.deadline_at)}).`
          : 'Your notes for this week.'
      }
      todo={[
        'Prompt chips (Highlight, Hard part, Proud of, Next week) and a typed note, up to 2,000 characters with a counter.',
        'Record a voice note, up to 3 minutes (hint at 2:30, stops at 3:00), or upload an audio file. Show the transcript to review and edit before saving.',
        'Before the first note: "Notes are shared with everyone in this group and read by AI to write the paper." Agreeing sets ai_consent: true.',
        'Attach where the note was written: if the profile uses automatic location, call approximateLocation() on save; otherwise send profile.city.',
        'List your notes this week (time, city, voice length), each with Edit and Delete while the week is open.',
        'Show the 429 weekly-limit message from the API (30 notes or 30 minutes of audio).',
        `Organizers only${isOrganizer ? ' (that’s you)' : ''}: "End week & publish" with an in-page confirm, then open the new edition (it shows "Putting together…" until ready). An empty week returns status "empty": say nobody wrote.`,
        'After saving, call refresh() from useGroup() so the People tab counts update.',
      ]}
      api={[
        'GET  /groups/{id}/periods/{pid}/reflections',
        'POST /groups/{id}/periods/{pid}/reflections  {body, status:"submitted", ai_consent:true, city, lat, lng, audio_path?, audio_duration_seconds?}',
        'PUT  /groups/{id}/reflections/{rid}   (same body)',
        'DELETE /groups/{id}/reflections/{rid}',
        'POST /groups/{id}/audio   multipart: file, ai_consent=true  → {audio_path, audio_duration_seconds, transcript, status}',
        'POST /groups/{id}/publish  {period_id}  → {edition_id, status: "queued" | "empty"}',
      ]}
      ready={[
        'useRecorder() in features/group/useRecorder.ts (3-minute MediaRecorder with auto-stop)',
        'approximateLocation() in lib/location.ts',
        'useGroup(): group, period, isOrganizer, meId, refresh()',
        'Shared styles in components/ui.ts (input, primary, secondary, record, card)',
        'Prototype of the whole flow: https://claude.ai/artifact/FaK1NSxn8AZmb5bbzddcWB',
      ]}
    />
  )
}
