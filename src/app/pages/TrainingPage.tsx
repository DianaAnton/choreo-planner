import { Link, useNavigate, useParams } from 'react-router';

import { AccountBar } from '../../features/auth';
import { InstallPrompt } from '../../features/pwa';
import {
  InboxScreen,
  LogSessionForm,
  SkillDetail,
  SkillsScreen,
  TodayScreen,
  useTraining,
} from '../../features/training';

/**
 * The training screens share a shell: one header, one nav, one back link. They
 * are separate routes rather than tabs so the phone's back button does what it
 * looks like it does.
 */
function TrainingShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { inbox } = useTraining();

  return (
    <main className="shell">
      <header className="page-header">
        <h1>{title}</h1>
        <AccountBar />
      </header>

      <nav className="tabs" aria-label="Training">
        <Link to="/training">Today</Link>
        <Link to="/training/skills">Skills</Link>
        <Link to="/training/inbox">
          Inbox{inbox.length > 0 && <span className="badge">{inbox.length}</span>}
        </Link>
        <Link to="/">Choreos</Link>
      </nav>

      <InstallPrompt />

      {children}
    </main>
  );
}

export function TodayPage() {
  return (
    <TrainingShell title="Training">
      <TodayScreen />
    </TrainingShell>
  );
}

export function SkillsPage() {
  return (
    <TrainingShell title="Skills">
      <SkillsScreen />
    </TrainingShell>
  );
}

export function InboxPage() {
  return (
    <TrainingShell title="Inbox">
      <InboxScreen />
    </TrainingShell>
  );
}

export function LogPage() {
  const navigate = useNavigate();
  return (
    <TrainingShell title="Log">
      <LogSessionForm
        onSaved={() => void navigate('/training')}
        onCancel={() => void navigate(-1)}
      />
    </TrainingShell>
  );
}

export function SkillPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const { skills, loading } = useTraining();
  const skill = skills.find((candidate) => candidate.id === skillId);

  if (loading) {
    return (
      <TrainingShell title="Skill">
        <p className="muted" aria-busy="true">
          Loading…
        </p>
      </TrainingShell>
    );
  }

  if (!skill) {
    return (
      <TrainingShell title="Skill">
        <p className="notice">That skill doesn’t exist any more.</p>
        <Link to="/training/skills">Back to your skills</Link>
      </TrainingShell>
    );
  }

  return (
    <TrainingShell title={skill.name}>
      <SkillDetail skill={skill} />
    </TrainingShell>
  );
}
