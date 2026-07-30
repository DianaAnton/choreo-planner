import { useMemo } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { FirebaseAuthGateway } from '../repositories/FirebaseAuthGateway';
import { FirestoreProjectRepository } from '../repositories/FirestoreProjectRepository';
import { AuthProvider, useAuth } from '../features/auth';
import { ProjectsProvider } from '../features/projects';
import { isFirebaseConfigured } from '../lib/firebase';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectsPage } from './pages/ProjectsPage';

/**
 * Composition root. This is the one layer that may name concrete
 * implementations — everything below it depends on the interfaces in
 * `src/repositories/types.ts`. See docs/AGENTS.md.
 */
export default function App() {
  // Created once: a new gateway per render would re-subscribe on every update.
  const gateway = useMemo(() => new FirebaseAuthGateway(), []);

  if (!isFirebaseConfigured()) {
    return (
      <main className="shell">
        <h1>Choreo Planner</h1>
        <p className="notice notice--error">
          Firebase config is missing. Copy <code>.env.example</code> to <code>.env.local</code>{' '}
          and fill it in — see <code>docs/firebase-setup.md</code>.
        </p>
      </main>
    );
  }

  return (
    <AuthProvider gateway={gateway}>
      <BrowserRouter>
        <SignedInApp />
      </BrowserRouter>
    </AuthProvider>
  );
}

function SignedInApp() {
  const { status, user, error } = useAuth();

  // The repository is scoped to a uid, so it cannot exist until sign-in
  // resolves — and must be rebuilt if the account changes (anonymous → Google).
  const repository = useMemo(
    () => (user ? new FirestoreProjectRepository(user.uid) : null),
    [user],
  );

  if (status === 'error') {
    return (
      <main className="shell">
        <h1>Choreo Planner</h1>
        <p className="notice notice--error">
          Could not sign in: {error?.message ?? 'unknown error'}
        </p>
      </main>
    );
  }

  if (!repository) {
    return (
      <main className="shell" aria-busy="true">
        <h1>Choreo Planner</h1>
        <p className="muted">Starting up…</p>
      </main>
    );
  }

  return (
    <ProjectsProvider repository={repository}>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="*" element={<ProjectsPage />} />
      </Routes>
    </ProjectsProvider>
  );
}
