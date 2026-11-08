import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, RequireAuth } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { ProfileProvider, RequireProfile } from './features/account/ProfileProvider'
import Welcome from './features/account/Welcome'
import EditionRoute from './features/edition/EditionPage'
import GroupLayout from './features/group/GroupLayout'
import GroupSettingsTab from './features/group/GroupSettingsTab'
import { ComposeRedirect } from './features/group/ComposeFab'
import NewsTab from './features/group/NewsTab'
import PeopleTab, { PersonView } from './features/group/PeopleTab'
import GroupsHome from './features/groups/GroupsHome'
import JoinPage from './features/groups/JoinPage'
import DevTools from './pages/DevTools'
import Login from './pages/Login'

// Development-only template preview (no backend or sign-in needed).
const PreviewEdition = lazy(() => import('./features/edition/PreviewEdition'))

const signedIn = (page: ReactNode) => (
  <RequireAuth>
    <RequireProfile>{page}</RequireProfile>
  </RequireAuth>
)

function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return <ProfileProvider key={user?.id ?? 'signed-out'}>{children}</ProfileProvider>
}

/** Route map: see frontend/README.md. Keep the edition path in sync with the backend's email link. */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/welcome" element={<RequireAuth><Welcome /></RequireAuth>} />
            <Route path="/" element={signedIn(<GroupsHome />)} />
            <Route path="/join" element={signedIn(<JoinPage />)} />
            <Route path="/groups/:groupId" element={signedIn(<GroupLayout />)}>
              {/* Two tabs: Weekly news (index) and People. Notes open from the compose button (?compose=). */}
              <Route index element={<NewsTab />} />
              <Route path="people" element={<PeopleTab />} />
              <Route path="people/:userId" element={<PersonView />} />
              <Route path="week" element={<ComposeRedirect />} />
              {/* Older links; "paper" keeps the empty-week notice after publishing. */}
              <Route path="paper" element={<NewsTab />} />
              <Route path="editions" element={<NewsTab />} />
              {/* The edition email links here. */}
              <Route path="editions/:editionId" element={<EditionRoute />} />
              <Route path="settings" element={<GroupSettingsTab />} />
            </Route>
            <Route path="/dev" element={<DevTools />} />
            {import.meta.env.DEV && (
              <Route path="/preview/edition" element={<Suspense><PreviewEdition /></Suspense>} />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
