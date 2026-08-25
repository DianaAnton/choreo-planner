import { createContext } from 'react';

import type { DisciplineProfile } from '../../domain/discipline';
import type { InboxItem, Session, Skill } from '../../domain/training';
import type { TrainingRepository } from '../../repositories/types';

/**
 * Live training state, shared across the four screens.
 *
 * Unlike `ProjectsContext`, which injects a repository and lets each caller
 * subscribe, this holds the data: Today, Log, Inbox and Skill detail all read
 * the same three collections, and four screens opening their own listeners
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
}

export const TrainingContext = createContext<TrainingState | null>(null);
