import { useCallback, useContext, useMemo } from 'react';

import {
  DEFAULT_WEEKLY_SESSION_TARGET,
  activeQuestSlotsLeft,
  activeQuests,
  canActivateQuest,
  canPromoteToKind,
  createCheckpoint,
  practiceMenu,
  staleSkills,
  todayKey,
  trainingDaysInWeekOf,
  type ActivationCheck,
  type InboxItem,
  type LadderState,
  type Session,
  type Skill,
  type SkillKind,
  type SkillMetric,
} from '../../domain/training';
import { STARTING_PATH, inPrerequisiteOrder } from '../../domain/trainingSeed';
import type { Id } from '../../domain/types';
import { newId } from '../../lib/ids';
import type {
  NewInboxItem,
  NewSession,
  NewSkill,
  TrainingRepository,
} from '../../repositories/types';
import { TrainingContext } from './TrainingContext';

export interface TrainingActions {
  /** `discipline` comes from the provider — callers never repeat it. */
  createSkill(input: Omit<NewSkill, 'discipline'>): Promise<Skill>;
  /** Writes the whole starting curriculum in one commit. */
  seedStartingPath(): Promise<Skill[]>;
  removeSkill(id: Id): Promise<void>;
  rename(skill: Skill, name: string): Promise<void>;
  setNotes(skill: Skill, notes: string): Promise<void>;
  setLadder(skill: Skill, ladder: LadderState): Promise<void>;
  setKind(skill: Skill, kind: SkillKind): Promise<void>;
  addCheckpoint(skill: Skill, text: string): Promise<void>;
  toggleCheckpoint(skill: Skill, checkpointId: Id): Promise<void>;
  removeCheckpoint(skill: Skill, checkpointId: Id): Promise<void>;
  addRef(skill: Skill, url: string, note?: string): Promise<void>;
  removeRef(skill: Skill, index: number): Promise<void>;
  setMetric(skill: Skill, metric: SkillMetric): Promise<void>;
  /** Refuses through the domain rule rather than throwing — the UI shows why. */
  activate(skill: Skill): Promise<ActivationCheck>;
  deactivate(skill: Skill): Promise<void>;
  logSession(input: NewSession): Promise<Session>;
  addInboxItem(input: NewInboxItem): Promise<InboxItem>;
  promoteInboxItem(
    item: InboxItem,
    input: Omit<NewSkill, 'discipline'>,
  ): Promise<ActivationCheck & { skill?: Skill }>;
  discardInboxItem(id: Id): Promise<void>;
}

export interface TrainingView {
  /** Exposed for the image panel, which subscribes to one document of its own. */
  repository: TrainingRepository;
  skills: Skill[];
  sessions: Session[];
  inbox: InboxItem[];
  loading: boolean;
  error: Error | null;
  discipline: string;
  byId: ReadonlyMap<Id, Skill>;
  /** At most three, by construction. */
  quests: Skill[];
  /** Practice skills, stalest first — the "ten minutes spare" menu. */
  practice: Skill[];
  /** Flagged as rusty: earned, then left for six weeks. */
  stale: Skill[];
  daysTrainedThisWeek: number;
  weeklyTarget: number;
  questSlotsLeft: number;
  actions: TrainingActions;
}

export function useTraining(): TrainingView {
  const context = useContext(TrainingContext);
  if (!context) {
    throw new Error('useTraining must be used inside <TrainingProvider>');
  }

  const { repository, discipline, skills, sessions, inbox, loading, error } = context;

  // Read from the wall clock rather than pinned in state — staleness measured
  // against a value frozen at mount would be wrong tomorrow — but bucketed to
  // the minute, or every render would invalidate the memo below. Staleness is
  // counted in days; a minute of lag is invisible.
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const today = todayKey();

  const patch = useCallback(
    (skill: Skill, changes: Partial<Skill>) => repository.updateSkill(skill.id, changes),
    [repository],
  );

  const actions = useMemo<TrainingActions>(
    () => ({
      createSkill: (input) => repository.createSkill({ ...input, discipline }),

      seedStartingPath: () => {
        // Ids first, so `requires` can point at siblings that do not exist yet
        // and the whole graph lands in one commit rather than thirty.
        const ordered = inPrerequisiteOrder(STARTING_PATH);
        const idByKey = new Map(ordered.map((item) => [item.key, repository.newSkillId()]));

        return repository.createSkills(
          ordered.map((item) => ({
            id: idByKey.get(item.key) ?? repository.newSkillId(),
            name: item.name,
            kind: item.kind,
            discipline,
            ...(item.category ? { category: item.category } : {}),
            ...(item.metric ? { metric: { ...item.metric, best: 0, bestAt: Date.now() } } : {}),
            checkpoints: (item.checkpoints ?? []).map((text) => createCheckpoint(text, newId())),
            requires: (item.requires ?? [])
              .map((key) => idByKey.get(key))
              .filter((id): id is Id => id !== undefined),
          })),
        );
      },
      removeSkill: (id) => repository.removeSkill(id),

      rename: (skill, name) => patch(skill, { name: name.trim() }),
      setNotes: (skill, notes) => patch(skill, { notes: notes.trim() }),
      setLadder: (skill, ladder) => patch(skill, { ladder }),

      // The ladder is kept across a kind change (see Skill.ladder): flipping a
      // quest to practice and back must not erase months of progress.
      setKind: (skill, kind) =>
        patch(skill, kind === 'practice' ? { kind, isActive: false } : { kind }),

      addCheckpoint: (skill, text) =>
        patch(skill, { checkpoints: [...skill.checkpoints, createCheckpoint(text, newId())] }),

      toggleCheckpoint: (skill, checkpointId) =>
        patch(skill, {
          checkpoints: skill.checkpoints.map((checkpoint) =>
            checkpoint.id === checkpointId
              ? { ...checkpoint, doneAt: checkpoint.doneAt === null ? Date.now() : null }
              : checkpoint,
          ),
        }),

      removeCheckpoint: (skill, checkpointId) =>
        patch(skill, {
          checkpoints: skill.checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId),
        }),

      addRef: (skill, url, note) =>
        patch(skill, { refs: [...skill.refs, note ? { url, note } : { url }] }),

      removeRef: (skill, index) =>
        patch(skill, { refs: skill.refs.filter((_, i) => i !== index) }),

      setMetric: (skill, metric) => patch(skill, { metric }),

      activate: async (skill) => {
        const check = canActivateQuest(skill, skills);
        if (check.ok) await patch(skill, { isActive: true });
        return check;
      },

      deactivate: (skill) => patch(skill, { isActive: false }),

      logSession: (input) => repository.logSession(input, skills),

      addInboxItem: (input) => repository.addInboxItem(input),

      promoteInboxItem: async (item, input) => {
        const check = canPromoteToKind(input.kind, skills);
        if (!check.ok) return check;

        const skill = await repository.promoteInboxItem(item, { ...input, discipline });
        return { ok: true, skill };
      },

      discardInboxItem: (id) => repository.removeInboxItem(id),
    }),
    [repository, discipline, skills, patch],
  );

  return useMemo<TrainingView>(
    () => ({
      repository,
      skills,
      sessions,
      inbox,
      loading,
      error,
      discipline,
      byId: new Map(skills.map((skill) => [skill.id, skill])),
      quests: activeQuests(skills),
      practice: practiceMenu(skills, now),
      stale: staleSkills(skills, now),
      daysTrainedThisWeek: trainingDaysInWeekOf(sessions, today),
      weeklyTarget: DEFAULT_WEEKLY_SESSION_TARGET,
      questSlotsLeft: activeQuestSlotsLeft(skills),
      actions,
    }),
    [repository, skills, sessions, inbox, loading, error, discipline, now, today, actions],
  );
}
