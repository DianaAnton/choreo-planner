import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { DisciplineProfile } from '../../domain/discipline';
import { planSession, type SessionPlan } from '../../domain/sessionPlan';
import {
  addDays,
  todayKey,
  type InboxItem,
  type Session,
  type Skill,
} from '../../domain/training';
import type { TrainingRepository } from '../../repositories/types';
import { TrainingContext, type PlanState, type TrainingState } from './TrainingContext';

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
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setPending(3);
    setError(null);
    // A pole plan is meaningless once the screen is showing skateboarding, and
    // its block ids would collide with the new discipline's.
    setPlan(null);
    setTicked(new Set());

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

  const planState = useMemo<PlanState>(
    () => ({
      current: plan,
      ticked,
      start: (minutes) => {
        // Built from the skills as they are right now, then left alone. The
        // live list keeps updating underneath; the plan does not follow it.
        setPlan(planSession(skills, minutes, profile));
        setTicked(new Set());
      },
      toggle: (blockId) =>
        setTicked((current) => {
          const next = new Set(current);
          if (!next.delete(blockId)) next.add(blockId);
          return next;
        }),
      discard: () => {
        setPlan(null);
        setTicked(new Set());
      },
    }),
    [plan, ticked, skills, profile],
  );

  const value = useMemo<TrainingState>(
    () => ({
      repository,
      profile,
      skills,
      sessions,
      inbox,
      loading: pending > 0,
      error,
      plan: planState,
    }),
    [repository, profile, skills, sessions, inbox, pending, error, planState],
  );

  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}
