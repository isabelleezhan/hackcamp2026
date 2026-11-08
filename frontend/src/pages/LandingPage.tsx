import { Link } from 'react-router'

// Replace these placeholders with the project URLs before launch.
const GITHUB_URL = 'https://github.com/isabelleezhan/mailbuds'
const DEVPOST_URL = 'https://devpost.com/software/mailbuds'
const CURRENT_YEAR = new Date().getFullYear()

const externalLink =
  'rounded-full border border-glass-line bg-white/70 px-3 py-2 text-sm font-semibold text-glass-text transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text'

export default function LandingPage() {
  return (
    <div className="sky min-h-screen font-system text-glass-text">
      <header className="landing-enter mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 sm:py-6">
        <Link to="/" className="flex items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text" aria-label="MailBuds home">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-accent text-sm font-extrabold text-white">M</span>
          <span className="text-xl font-extrabold tracking-tight">MailBuds</span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={externalLink}>GitHub</a>
          <a href={DEVPOST_URL} target="_blank" rel="noreferrer" className={externalLink}>Devpost</a>
          <Link to="/login" className="rounded-full px-3 py-2 text-sm font-semibold text-accent-text hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">Log in</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-0 sm:px-8">
        <section className="landing-enter landing-enter-late relative isolate grid gap-10 overflow-hidden rounded-4xl border border-glass-line bg-glass px-6 py-12 shadow-[0_24px_60px_rgba(36,56,92,.12)] backdrop-blur-xl sm:px-10 sm:py-16 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:px-14 lg:py-20" aria-labelledby="hero-title">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 -z-10 size-72 rounded-full bg-accent/10 blur-3xl sm:size-96" />
          <div className="max-w-2xl">
            <h1 id="hero-title" className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              One weekly paper for your private group.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-glass-muted sm:text-xl">
              Add text or voice notes during the week. At publication time, Gemini organizes the group's
              submissions into an attributed newspaper you can read in the app or by email.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 py-3 font-bold text-white shadow-[0_8px_18px_rgba(74,155,232,.25)] transition duration-200 hover:-translate-y-0.5 hover:bg-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text motion-reduce:transform-none motion-reduce:transition-none">
                Start your group
              </Link>
              <a href="#how-it-works" className="inline-flex min-h-12 items-center rounded-full px-5 py-3 font-semibold text-glass-text underline decoration-accent/50 underline-offset-4 hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
                See how it works
              </a>
            </div>
            <p className="mt-4 text-sm text-glass-muted">Private groups for the people you choose.</p>
          </div>

          <div className="mx-auto w-full max-w-sm lg:justify-self-end" aria-hidden="true">
            <div className="landing-paper rounded-3xl border border-glass-line bg-white/90 p-5 shadow-[0_20px_50px_rgba(36,56,92,.16)] sm:p-7">
              <div className="flex items-start justify-between gap-3 border-b border-glass-line pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-accent-text">The weekly paper</p>
                  <p className="mt-1 text-sm text-glass-muted">Notes from your group</p>
                </div>
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-lg">✦</span>
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold leading-tight">Your group's weekly edition</h2>
              <p className="mt-3 text-sm leading-relaxed text-glass-muted">A sample of the stories submitted by group members.</p>
              <div className="mt-6 space-y-3" aria-hidden="true">
                <div className="h-2 rounded-full bg-sky-mid" />
                <div className="h-2 w-5/6 rounded-full bg-sky-mid" />
                <div className="h-2 w-2/3 rounded-full bg-sky-mid" />
              </div>
              <div className="mt-6 flex items-center gap-2 border-t border-glass-line pt-4">
                <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-text">A</span>
                <span className="grid size-8 place-items-center rounded-full bg-secondary-soft text-xs font-bold text-secondary-text">J</span>
                <span className="grid size-8 place-items-center rounded-full bg-chip text-xs font-bold text-accent-text">M</span>
                <span className="ml-1 text-xs text-glass-muted">Member stories</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" aria-labelledby="about-title">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="about-title" className="mt-3 font-display text-3xl font-bold sm:text-4xl">Notes in. A newspaper out.</h2>
            <p className="mt-4 text-lg leading-relaxed text-glass-muted">
              MailBuds is a React web app with private groups backed by Supabase and a FastAPI server. Members add
              text or voice reflections; at publication time, Gemini turns the submitted notes into attributed stories.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="landing-card rounded-2xl border border-glass-line bg-white/75 p-6 shadow-sm">
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-xl text-accent-text">✎</span>
              <h3 className="mt-5 text-xl font-bold">Text and voice notes</h3>
              <p className="mt-2 leading-relaxed text-glass-muted">Write in the app or record audio. Gemini transcribes voice notes, and you can edit the transcript before saving.</p>
            </article>
            <article className="landing-card rounded-2xl border border-glass-line bg-white/75 p-6 shadow-sm">
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-secondary-soft text-xl text-secondary-text">✦</span>
              <h3 className="mt-5 text-xl font-bold">A structured weekly edition</h3>
              <p className="mt-2 leading-relaxed text-glass-muted">Gemini drafts attributed stories from the week's notes. The app checks the result and displays it in a consistent newspaper layout.</p>
            </article>
            <article className="landing-card rounded-2xl border border-glass-line bg-white/75 p-6 shadow-sm sm:col-span-2 lg:col-span-1">
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-chip text-xl text-accent-text">◎</span>
              <h3 className="mt-5 text-xl font-bold">Globe and email delivery</h3>
              <p className="mt-2 leading-relaxed text-glass-muted">The group page places members at their approximate cities. Read each edition there or opt in to email delivery through Resend.</p>
            </article>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-8 rounded-4xl border border-glass-line bg-white/55 px-6 py-12 sm:px-10 sm:py-14" aria-labelledby="how-title">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[.14em] text-accent-text">From setup to published issue</p>
            <h2 id="how-title" className="mt-3 font-display text-3xl font-bold sm:text-4xl">How MailBuds works</h2>
          </div>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            <li className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold text-white">1</span>
              <div><h3 className="text-lg font-bold">Create and invite</h3><p className="mt-1 leading-relaxed text-glass-muted">Create a group and share its join code. Supabase manages sign-in; the FastAPI server checks group access.</p></div>
            </li>
            <li className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold text-white">2</span>
              <div><h3 className="text-lg font-bold">Submit reflections</h3><p className="mt-1 leading-relaxed text-glass-muted">Add text or a voice note in the React app. Review and edit Gemini's transcript before saving audio notes.</p></div>
            </li>
            <li className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold text-white">3</span>
              <div><h3 className="text-lg font-bold">Publish and read</h3><p className="mt-1 leading-relaxed text-glass-muted">FastAPI sends the saved notes to Gemini to draft attributed stories. The issue appears in the app and is emailed to members who opted in.</p></div>
            </li>
          </ol>
        </section>

      </main>

      <div className="landing-endcap">
        <section className="mx-auto max-w-6xl px-5 pt-8 text-center sm:px-8 sm:pt-12" aria-labelledby="closing-title">
          <div className="px-2 py-6 sm:py-10">
            <h2 id="closing-title" className="font-display text-3xl font-bold sm:text-4xl">Start your group's first issue.</h2>
            <p className="mx-auto mt-3 max-w-xl leading-relaxed text-glass-muted">Create a group, invite its members, and collect notes for the next edition.</p>
            <Link to="/login" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 py-3 font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text motion-reduce:transform-none motion-reduce:transition-none">Get started</Link>
          </div>
        </section>

        <footer className="landing-footer relative isolate flex min-h-40 flex-col gap-4 overflow-hidden pt-6 sm:gap-3">
          <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-sm font-semibold text-glass-text/75 sm:px-8">
            <span>&copy; {CURRENT_YEAR} MailBuds</span>
            <nav aria-label="Project links" className="flex items-center gap-5 sm:gap-8">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">GitHub</a>
              <a href={DEVPOST_URL} target="_blank" rel="noreferrer" className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">Devpost</a>
            </nav>
          </div>

          <svg className="landing-mail landing-mail-one" viewBox="0 0 120 88" aria-hidden="true">
            <rect x="7" y="14" width="106" height="66" rx="9" fill="white" />
            <path d="M9 22 60 58l51-36" fill="#dcecff" />
            <path d="m9 75 36-31m66 31L75 44" fill="none" stroke="#9fc8f3" strokeWidth="4" />
            <path d="M9 22 60 58l51-36" fill="none" stroke="#4a9be8" strokeWidth="4" strokeLinejoin="round" />
            <circle cx="60" cy="46" r="7" fill="#f07a73" />
          </svg>
          <svg className="landing-mail landing-mail-two" viewBox="0 0 120 88" aria-hidden="true">
            <rect x="7" y="14" width="106" height="66" rx="9" fill="white" />
            <path d="M9 22 60 58l51-36" fill="#ffe8e5" />
            <path d="m9 75 36-31m66 31L75 44" fill="none" stroke="#f3b2ad" strokeWidth="4" />
            <path d="M9 22 60 58l51-36" fill="none" stroke="#f07a73" strokeWidth="4" strokeLinejoin="round" />
            <circle cx="60" cy="46" r="7" fill="#4a9be8" />
          </svg>
          <svg className="landing-mail landing-mail-three" viewBox="0 0 120 88" aria-hidden="true">
            <rect x="7" y="14" width="106" height="66" rx="9" fill="white" />
            <path d="M9 22 60 58l51-36" fill="#e3f0ff" />
            <path d="m9 75 36-31m66 31L75 44" fill="none" stroke="#9fc8f3" strokeWidth="4" />
            <path d="M9 22 60 58l51-36" fill="none" stroke="#4a9be8" strokeWidth="4" strokeLinejoin="round" />
            <circle cx="60" cy="46" r="7" fill="#f07a73" />
          </svg>

          <img src="/1.svg" alt="MailBuds" className="landing-wordmark relative z-0" />
        </footer>
      </div>
    </div>
  )
}
