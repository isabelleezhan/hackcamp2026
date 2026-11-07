# Timeline: HackCamp 2026

All times Pacific. **Hacking ends Sun Nov 8, 12:00 p.m.; Devpost locks then, with no edits after.**
Written Sat 2:45 p.m. with about 21 hours left. Owners are suggestions based on who has touched
what so far (Alson: backend, Jerry: frontend scaffold, Isabelle: product, design, globe). Reassign freely.

Fixed events to plan around:
- **Sun 8:00 a.m.: everyone must move** from Sauder (HA 098) to MacIsaac (GWHB B1402). No one may
  stay behind. Expect to lose 7:30 to 8:30 a.m.
- Sun 12:00 p.m.: submission deadline. Judging slots are announced on Discord (4 min pitch + 4 min Q&A).
- Sun 4:00 p.m.: closing ceremony. Someone must be there to collect a prize.

Ground rules:
- Commit small and often; organizers can ask to see steady commits.
- `main` should always run. Deploy early and keep the deployed app working.
- Scope order when time runs short: **typed note → paper → email**, then **globe**, then **voice**.

---

## Block 1: Sat 2:45 to 4:00 p.m. — Reconcile and unblock
The backend was built to the original PRD; AGENTS.md changed the plan. Decide, then align.

| Task | Owner | Done when |
|---|---|---|
| Team call: confirm many notes per week, 3-minute voice, approximate location, email + password sign-in | All | Decisions written into AGENTS.md |
| Migration `0003`: drop one-per-week rule, allow 180 s audio, add location and time zone to profiles, location to reflections | Alson | Applied to Supabase; `verify_schema.sql` passes |
| Backend: notes become a list (`POST` add, `PATCH`/`DELETE` by id), weekly limit, 180 s in `media.py` and models | Alson | Tests pass |
| Start **Resend domain verification** (DNS can take hours) | Isabelle | Domain shows "pending" or "verified" |
| Create **n8n Cloud** account and workflow that calls `POST /internal/tick` every few minutes | Isabelle | Workflow saved (inactive is fine) |
| Deploy skeletons: backend to Render, frontend to Vercel, env vars set, CORS includes Vercel URL | Jerry | `/health` and the login page load from the deployed URLs |

## Block 2: Sat 4:00 to 7:00 p.m. — Typed note to newspaper (the must-ship flow)
| Task | Owner | Done when |
|---|---|---|
| Login page: email + password (or keep codes if the team decided so) | Jerry | Two accounts can sign in on the deployed site |
| Groups UI: create group, invite link `/join/:code`, join by code, email toggle | Jerry | Second account joins via link |
| Note composer (text only first): add, edit, delete this week's notes | Jerry | Notes save to the backend |
| "End week & publish" button for organizers; progress state while generating | Jerry | Button triggers `/groups/{id}/publish` |
| Gemini generation end to end with real notes; check attribution rules | Alson | A real edition is published from 2+ people's notes |
| **Newspaper template** for the edition (masthead, lead, a story per person, little victories, looking ahead) | Isabelle | Edition renders well on phone and desktop |

**7:00 p.m. checkpoint:** two accounts → notes → publish → paper visible on the deployed site. If
this isn't working, everyone helps finish it before starting anything new.

## Block 3: Sat 7:00 to 10:00 p.m. — Email and globe
| Task | Owner | Done when |
|---|---|---|
| Edition email through Resend: highlights and a link to the issue that requires signing in | Alson | An opted-in member receives it; an opted-out member doesn't |
| n8n workflow active: tick → publish due weeks → deliver | Isabelle | Scheduled run delivers without the button |
| Globe home page in React: port the prototype (`react-globe.gl`, local Earth textures, avatar pins, People sheet) | Isabelle | Pins appear at members' cities; tapping one shows their story |
| Location capture: permission prompt, rounding to 1 decimal, typed-city fallback, reverse geocoding | Jerry + Alson | Each member's city shows on the globe |
| Archive list of past issues | Jerry | Older issues open from the group page |

## Block 4: Sat 10:00 p.m. to 1:00 a.m. — Voice notes
| Task | Owner | Done when |
|---|---|---|
| Recorder: MediaRecorder, 3-minute limit with a hint at 2:30, upload | Jerry | Recording works on Chrome and iPhone Safari |
| Transcription review: Gemini transcript appears, person edits, then saves | Alson | Misheard words can be fixed before saving |
| Fallback: type instead if the microphone or transcription fails | Jerry | Clear error message with a way to keep going |
| Datelines in the paper from where notes were recorded | Alson | "LISBON — …" appears for travellers |

## Sat 1:00 to 7:00 a.m. — Sleep in shifts
Keep at least one person on call at a time. Nothing new gets merged without a second person checking it.
Good solo tasks: empty and error states, keyboard and screen-reader pass, loading states, copy polish.

## Block 5: Sun 7:00 to 8:30 a.m. — Move venues
Pack up by 7:30. Commit and push everything before moving. Set up again at MacIsaac.

## Block 6: Sun 8:30 to 10:30 a.m. — Feature freeze and bug bash
| Task | Owner | Done when |
|---|---|---|
| **Feature freeze at 8:30.** Only fixes from here. | All | |
| Check every PRD acceptance criterion on the deployed site (two accounts, voice note, one edition from repeated publishes, opted-out member, an unrelated account can't read) | All | Each one ticked |
| Seed the demo group: 4 to 6 accounts in different cities, a week of notes, one voice note | Isabelle | Demo group is ready to publish live |
| Record a backup demo video (2 minutes) in case Wi-Fi fails during judging | Jerry | Video saved locally and linked on Devpost |
| Warm up the Render backend before judging (free tier sleeps) | Alson | |

## Block 7: Sun 10:30 a.m. to 12:00 p.m. — Submit
| Task | Owner | Done when |
|---|---|---|
| Devpost write-up: problem, who it's for, how it works, how AI is used responsibly, challenges, what's next | Isabelle | Draft reviewed by one teammate |
| Opt into prizes: **Community Impact** (our one superlative; needs an impact statement), Best use of n8n, Best Use of Gemini API, GoDaddy domain (if registered) | Isabelle | Ticked on Devpost |
| Repo public and the README accurate | Alson | |
| **Submit by 11:30 a.m.** (30-minute buffer) | Isabelle | Submission confirmed |

## Sun 12:00 to 4:00 p.m. — Judging
- Rehearse the 4-minute pitch at least twice:
  1. the problem (30 s);
  2. live demo: notes from around the globe, then **End week & publish**, the paper lands, and the email arrives on another phone;
  3. how the AI stays honest: attribution, nothing invented;
  4. what's next.
- Prepare answers for: privacy and location, cost per group, what happens to hard news, why not a group chat.
- Arrive at the judging entrance 5 minutes early. Be at closing at 4:00.
