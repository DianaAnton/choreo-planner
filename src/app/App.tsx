import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { FirebaseAuthGateway } from '../repositories/FirebaseAuthGateway';
import { FirestoreProjectRepository } from '../repositories/FirestoreProjectRepository';
import { FirestoreTrainingRepository } from '../repositories/FirestoreTrainingRepository';
import { AuthProvider, useAuth } from '../features/auth';
import { ProjectsProvider } from '../features/projects';
import { TrainingProvider } from '../features/training';
import { UpdatePrompt } from '../features/pwa';
import { isFirebaseConfigured } from '../lib/firebase';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { InboxPage, LogPage, SkillPage, SkillsPage, TodayPage } from './pages/TrainingPage';
import { POLE, disciplines } from './registry';

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
  const training = useMemo(
    () => (user ? new FirestoreTrainingRepository(user.uid) : null),
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

  if (!repository || !training) {
    return (
      <main className="shell" aria-busy="true">
        <h1>Choreo Planner</h1>
        <p className="muted">Starting up…</p>
      </main>
    );
  }

  return (
    <ProjectsProvider repository={repository}>
      <DisciplineGate repository={training} />
    </ProjectsProvider>
  );
}

/**
 * Which discipline is showing. Read from the account rather than local storage:
 * on iOS an installed app and Safari have separate storage, and "which sport am
 * I" is a fact about the person, not the device.
 *
 * The choreo planner is pole-specific, so its routes only exist when the active
 * profile claims them — a skateboarder should not be offered a tab for laying
 * out pole routines against a song (ADR 0013).
 */
function DisciplineGate({ repository }: { repository: FirestoreTrainingRepository }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(
    () =>
      repository.subscribeSettings(
        (settings) => setActiveId(settings.activeDiscipline ?? POLE.id),
        // A settings read that fails should not black out the app; fall back to
        // the default and let the training screens report their own errors.
        () => setActiveId(POLE.id),
      ),
    [repository],
  );

  const profile = useMemo(
    () => (activeId ? (disciplines.get(activeId) ?? POLE) : null),
    [activeId],
  );

  if (!profile) {
    return (
      <main className="shell" aria-busy="true">
        <h1>Choreo Planner</h1>
        <p className="muted">Starting up…</p>
      </main>
    );
  }

  return (
    <TrainingProvider repository={repository} profile={profile}>
      <UpdatePrompt />
      <Routes>
        <Route path="/training" element={<TodayPage />} />
        <Route path="/training/log" element={<LogPage />} />
        <Route path="/training/inbox" element={<InboxPage />} />
        <Route path="/training/skills" element={<SkillsPage />} />
        <Route path="/training/skills/:skillId" element={<SkillPage />} />

        {profile.hasChoreo && (
          <>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
          </>
        )}

        {/* With no choreo planner, training is the home screen. */}
        <Route path="*" element={profile.hasChoreo ? <ProjectsPage /> : <TodayPage />} />
      </Routes>
    </TrainingProvider>
  );
}
