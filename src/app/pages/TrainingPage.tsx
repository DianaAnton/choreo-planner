import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { AccountBar } from '../../features/auth';
import { InstallPrompt } from '../../features/pwa';
import { disciplines } from '../registry';
import {
  DisciplineSwitch,
  InboxScreen,
  LogSessionForm,
  SessionPlanScreen,
  SkillDetail,
  SkillsScreen,
  TodayScreen,
  useTraining,
} from '../../features/training';
import type { Id } from '../../domain/types';

/**
 * The training screens share a shell: one header, one nav, one back link. They
 * are separate routes rather than tabs so the phone's back button does what it
 * looks like it does.
 */
function TrainingShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { inbox, profile } = useTraining();

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
        {/* Pole-only: a skateboarder has no use for a choreography planner. */}
        {profile.hasChoreo && <Link to="/">Choreos</Link>}
      </nav>

      <DisciplineSwitch available={disciplines.all()} />

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

export function PlanPage() {
  return (
    <TrainingShell title="Plan">
      <SessionPlanScreen />
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

/**
 * What a plan hands over when you finish it: the skills its ticked blocks
 * named, and how many minutes those blocks came to. Router state rather than a
 * query string — it is a handoff between two screens, not a URL worth sharing.
 */
interface LogPrefill {
  skillIds?: readonly Id[];
  durationMin?: number;
}

export function LogPage() {
  const navigate = useNavigate();
  const { plan } = useTraining();
  // Anything can be pushed into router state, including by a stale tab after a
  // deploy, so read it defensively rather than trusting the shape.
  const prefill = usePrefill();

  return (
    <TrainingShell title="Log">
      <LogSessionForm
        {...(prefill ? { initial: prefill } : {})}
        onSaved={() => {
          // The plan is done with once it has been logged; leaving it around
          // would offer to log the same session twice.
          plan.discard();
          void navigate('/training');
        }}
        onCancel={() => void navigate(-1)}
      />
    </TrainingShell>
  );
}

function usePrefill(): LogPrefill | null {
  const { state } = useLocation();
  if (typeof state !== 'object' || state === null) return null;

  const { skillIds, durationMin } = state as LogPrefill;
  const ids = Array.isArray(skillIds) ? skillIds.filter((id) => typeof id === 'string') : [];
  const minutes =
    typeof durationMin === 'number' && Number.isFinite(durationMin) && durationMin > 0
      ? durationMin
      : undefined;

  if (ids.length === 0 && minutes === undefined) return null;
  return { skillIds: ids, ...(minutes === undefined ? {} : { durationMin: minutes }) };
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
