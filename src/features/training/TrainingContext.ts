import { createContext } from 'react';

import type { DisciplineProfile } from '../../domain/discipline';
import type { SessionPlan } from '../../domain/sessionPlan';
import type { InboxItem, Session, Skill } from '../../domain/training';
import type { TrainingRepository } from '../../repositories/types';

/**
 * The plan you are working through, and which of its blocks are done.
 *
 * Deliberately not persisted. A plan is derived from the skills you have and
 * the time you have — the same as the Today list — and the thing worth keeping
 * out of a session is the session, which the Log screen already writes. Storing
 * plans would mean a fourth collection, its own rules and a migration, to
 * remember something whose whole life is the next fifty minutes (ADR 0015).
 *
 * It lives up here rather than in the screen so that tapping through to a skill
 * to read your notes does not lose the ticks you have already made.
 */
export interface PlanState {
  /** Frozen when you build it: a plan must not rewrite itself mid-session. */
  current: SessionPlan | null;
  /** Block ids ticked so far. */
  ticked: ReadonlySet<string>;
  start(minutes: number): void;
  toggle(blockId: string): void;
  discard(): void;
}

/**
 * Live training state, shared across the training screens.
 *
 * Unlike `ProjectsContext`, which injects a repository and lets each caller
 * subscribe, this holds the data: Today, Plan, Log, Inbox and Skill detail all
 * read the same three collections, and five screens opening their own listeners
 * would re-subscribe on every navigation for no benefit.
 */
export interface TrainingState {
  repository: TrainingRepository;
  /** The whole profile, not just its id: screens need its wording too. */
  profile: DisciplineProfile;
  skills: Skill[];
  /** A bounded recent window, not all history — see SESSION_WINDOW_DAYS. */
  sessions: Session[];
  inbox: InboxItem[];
  loading: boolean;
  error: Error | null;
  plan: PlanState;
}

export const TrainingContext = createContext<TrainingState | null>(null);
