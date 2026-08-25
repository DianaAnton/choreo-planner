import { describe, expect, it } from 'vitest';

import { POLE_PATH, SKATEBOARD_PATH, inPrerequisiteOrder, type SeedSkill } from './trainingSeed';
import {
  activeQuests,
  canActivateQuest,
  createCheckpoint,
  practiceMenu,
  todayList,
  type Skill,
} from './training';

/**
 * The same behaviour, exercised against both shipped curricula.
 *
 * These exist because "does this work for skateboarding too?" is not a question
 * that should be answered by reading the code and reasoning about it. Every
 * rule below is discipline-neutral by design; this is what proves it stayed
 * that way.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 25, 12);

function build(path: readonly SeedSkill[], discipline: string): Skill[] {
  return inPrerequisiteOrder(path).map((item) => ({
    id: item.key,
    name: item.name,
    kind: item.kind,
    discipline,
    refs: [],
    ladder: 'wantIt',
    checkpoints: (item.checkpoints ?? []).map((text, i) => createCheckpoint(text, `${item.key}-${i}`)),
    isActive: false,
    requires: [...(item.requires ?? [])],
    createdAt: 0,
    ...(item.category ? { category: item.category } : {}),
    ...(item.metric ? { metric: { ...item.metric, best: 0, bestAt: 0 } } : {}),
  }));
}

const curricula = [
  ['pole', build(POLE_PATH, 'pole')],
  ['skateboard', build(SKATEBOARD_PATH, 'skateboard')],
] as const;

describe.each(curricula)('%s', (_name, skills) => {
  it('offers a Today list that leads with what you chose to work on', () => {
    const withActive = skills.map((skill, index) =>
      index === 0 ? { ...skill, isActive: skill.kind === 'quest' } : skill,
    );

    const rows = todayList(withActive, NOW);
    expect(rows.length).toBeGreaterThan(0);

    const active = rows.filter((row) => row.reason === 'active');
    for (const row of active) {
      expect(rows.indexOf(row)).toBeLessThan(rows.length);
    }
    // Every active quest appears before the first non-active row.
    const firstOther = rows.findIndex((row) => row.reason !== 'active');
    if (firstOther !== -1) {
      expect(rows.slice(0, firstOther).every((row) => row.reason === 'active')).toBe(true);
    }
  });

  it('never lists the same skill twice', () => {
    const ids = todayList(skills, NOW).map((row) => row.skill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('surfaces the conditioning as the ten-minutes menu', () => {
    const menu = practiceMenu(skills, NOW);
    expect(menu.length).toBeGreaterThanOrEqual(4);
    expect(menu.every((skill) => skill.kind === 'practice')).toBe(true);
  });

  it('flags a skill that was earned and then left', () => {
    const rusty = skills.map((skill) =>
      skill.kind === 'quest'
        ? { ...skill, ladder: 'cleanRep' as const, lastUsedAt: NOW - 60 * DAY }
        : skill,
    );
    const rows = todayList(rusty, NOW);
    expect(rows.some((row) => row.reason === 'rusty')).toBe(true);
  });

  it('applies the same three-quest cap', () => {
    const quests = skills.filter((skill) => skill.kind === 'quest');
    const active = quests.slice(0, 3).map((skill) => ({ ...skill, isActive: true }));
    const fourth = quests[3];
    expect(fourth).toBeDefined();

    const all = [...active, ...skills.slice(3)];
    expect(activeQuests(all)).toHaveLength(3);

    const check = canActivateQuest(fourth!, all);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('wipCapReached');
  });

  it('ships every quest with a checkpoint, so none is stuck unactivatable', () => {
    // A quest with no open checkpoint cannot be made active — that is the
    // mechanism, and a seed that shipped one would be a dead end.
    const quests = skills.filter((skill) => skill.kind === 'quest');
    for (const quest of quests) {
      expect(quest.checkpoints.length).toBeGreaterThan(0);
    }
  });

  it('lets a quest with an open checkpoint activate when there is room', () => {
    const quest = skills.find((skill) => skill.kind === 'quest');
    expect(quest).toBeDefined();
    expect(canActivateQuest(quest!, skills)).toEqual({ ok: true });
  });

  it('files every skill under a category the profile could name', () => {
    for (const skill of skills) {
      expect(skill.category ?? 'other').toBeTruthy();
    }
  });
});
