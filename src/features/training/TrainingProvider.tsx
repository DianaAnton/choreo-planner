import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { DisciplineProfile } from '../../domain/discipline';
import {
  addDays,
  todayKey,
  type InboxItem,
  type Session,
  type Skill,
} from '../../domain/training';
import type { TrainingRepository } from '../../repositories/types';
import { TrainingContext, type TrainingState } from './TrainingContext';

/**
 * How far back the session subscription reaches. Long enough to answer the two
 * questions the screens ask — "how many days this week" and "when did I last
 * touch this" — and short enough that the read stays small forever. History
 * older than this exists in Firestore; nothing on screen asks for it yet.
 */
export const SESSION_WINDOW_DAYS = 180;

interface Props {
  repository: TrainingRepository;
  profile: DisciplineProfile;
  children: ReactNode;
}

export function TrainingProvider({ repository, profile, children }: Props) {
  const discipline = profile.id;

  const [skills, setSkills] = useState<Skill[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [pending, setPending] = useState(3);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setPending(3);
    setError(null);

    // One decrement per collection, on its first snapshot or its first failure,
    // so "loading" ends even when one listener never resolves happily.
    const settle = () => setPending((count) => Math.max(0, count - 1));
    const settleOnce = () => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        settle();
      };
    };

    const fail = (settled: () => void) => (cause: Error) => {
      // A listener error here is a rules denial or a missing index — both
      // silent failures if we only logged them.
      setError(cause);
      settled();
    };

    const skillsSettled = settleOnce();
    const sessionsSettled = settleOnce();
    const inboxSettled = settleOnce();

    const since = addDays(todayKey(), -SESSION_WINDOW_DAYS);

    const unsubscribes = [
      repository.subscribeSkills(
        discipline,
        (next) => {
          setSkills(next);
          skillsSettled();
        },
        fail(skillsSettled),
      ),
      repository.subscribeSessions(
        since,
        (next) => {
          setSessions(next);
          sessionsSettled();
        },
        fail(sessionsSettled),
      ),
      repository.subscribeInbox((next) => {
        setInbox(next);
        inboxSettled();
      }, fail(inboxSettled)),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [repository, discipline]);

  const value = useMemo<TrainingState>(
    () => ({
      repository,
      profile,
      skills,
      sessions,
      inbox,
      loading: pending > 0,
      error,
    }),
    [repository, profile, skills, sessions, inbox, pending, error],
  );

  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}
