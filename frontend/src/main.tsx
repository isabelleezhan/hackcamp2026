import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

root.render(<p className="p-8">Loading Community Newspaper…</p>)

// Import after mounting so configuration failures are visible on the page.
async function start() {
  try {
    const { default: App } = await import('./App.tsx')
    root.render(<StrictMode><App /></StrictMode>)
  } catch (error) {
    console.error('Frontend startup failed:', error)
    root.render(
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-3xl font-bold">Community Newspaper</h1>
        <h2 className="mt-6 text-xl font-semibold">Frontend setup needs attention</h2>
        <p role="alert" className="mt-3 whitespace-pre-wrap">
          {error instanceof Error ? error.message : 'The app could not start. Check the browser console.'}
        </p>
        <p className="mt-4 text-sm text-stone-600">
          Add your Supabase project URL and public key to frontend/.env.local,
          then restart the frontend with npm run dev. The Gemini key belongs in backend/.env.
        </p>
      </main>,
    )
  }
}

void start()
