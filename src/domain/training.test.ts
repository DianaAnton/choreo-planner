import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEEKLY_SESSION_TARGET,
  LADDER,
  MAX_ACTIVE_QUESTS,
  MAX_SESSION_MINUTES,
  STALE_AFTER_DAYS,
  activeQuestSlotsLeft,
  activeQuests,
  addDays,
  advanceLadder,
  canActivateQuest,
  canPromoteToKind,
  checkpointProgress,
  createCheckpoint,
  createInboxItem,
  createSession,
  createSkill,
  dateKeyOf,
  daysBetweenKeys,
  daysSinceUsed,
  holdsForBar,
  improvedMetric,
  isDateKey,
  isLadderAtLeast,
  isSameWeek,
  isStale,
  ladderIndex,
  lowestLadder,
  nextCheckpoint,
  normalizeUrl,
  practiceMenu,
  retreatLadder,
  sessionTimeMs,
  sessionsForSkill,
  skillFromInboxItem,
  staleSkills,
  startOfWeek,
  touchesForSession,
  trainingDaysInWeekOf,
  unmetPrerequisites,
  validateInboxItem,
  validateNewSkill,
  validateSession,
  type Session,
  type Skill,
} from './training';

const DAY = 86_400_000;
/** A fixed "now" so nothing in here depends on the day the tests are run. */
const NOW = Date.UTC(2026, 7, 23, 12);

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 's1',
    name: 'Ayesha',
    kind: 'quest',
    discipline: 'pole',
    refs: [],
    ladder: 'wantIt',
    checkpoints: [],
    isActive: false,
    requires: [],
    createdAt: 0,
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'x1',
    date: '2026-08-22',
    durationMin: 45,
    felt: 2,
    skillIds: [],
    ...overrides,
  };
}

const open = (id: string, text = 'hold 5s') => createCheckpoint(text, id);

describe('the ladder', () => {
  it('is ordinal, low to high', () => {
    expect(ladderIndex('wantIt')).toBe(0);
    expect(ladderIndex('inChoreo')).toBe(LADDER.length - 1);
    expect(isLadderAtLeast('filmed', 'cleanRep')).toBe(true);
    expect(isLadderAtLeast('drilling', 'cleanRep')).toBe(false);
    expect(isLadderAtLeast('cleanRep', 'cleanRep')).toBe(true);
  });

  it('clamps at both ends rather than falling off', () => {
    expect(advanceLadder('inChoreo')).toBe('inChoreo');
    expect(retreatLadder('wantIt')).toBe('wantIt');
    expect(advanceLadder('uglyRep')).toBe('cleanRep');
    expect(retreatLadder('cleanRep')).toBe('uglyRep');
  });

  it('reports the lowest state — this is section readiness', () => {
    expect(lowestLadder(['inChoreo', 'drilling', 'filmed'])).toBe('drilling');
    expect(lowestLadder([])).toBeNull();
  });

  it('tests cleanRep against the bar, or the discipline floor when the bar is shorter', () => {
    // 143 BPM: one 8-count is ~3357 ms, above pole's 3000 ms floor.
    expect(holdsForBar(3400, 3357, 3000)).toBe(true);
    expect(holdsForBar(3200, 3357, 3000)).toBe(false);
    // A fast track where the bar is under the floor: the floor wins.
    expect(holdsForBar(2500, 2000, 3000)).toBe(false);
  });
});

describe('the WIP cap', () => {
  const withCheckpoint = (id: string, name: string, isActive = false) =>
    skill({ id, name, checkpoints: [open(`${id}-c`)], isActive });

  it('lets a quest with an open checkpoint activate below the cap', () => {
    const target = withCheckpoint('s4', 'Ayesha');
    const all = [withCheckpoint('s1', 'A', true), withCheckpoint('s2', 'B', true), target];
    expect(canActivateQuest(target, all)).toEqual({ ok: true });
    expect(activeQuestSlotsLeft(all)).toBe(1);
  });

  it('refuses a fourth active quest, and names the three in the way', () => {
    const target = withCheckpoint('s4', 'Ayesha');
    const all = [
      withCheckpoint('s1', 'A', true),
      withCheckpoint('s2', 'B', true),
      withCheckpoint('s3', 'C', true),
      target,
    ];

    const result = canActivateQuest(target, all);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('wipCapReached');
    expect(result.message).toContain('A, B, C');
    expect(activeQuestSlotsLeft(all)).toBe(0);
  });

  it('refuses a quest with no open checkpoint — a name is not a plan', () => {
    const target = skill({ checkpoints: [{ ...open('c1'), doneAt: 5 }] });
    const result = canActivateQuest(target, [target]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('noOpenCheckpoint');
  });

  it('does not count practice skills against the cap', () => {
    const target = withCheckpoint('s9', 'Ayesha');
    const conditioning = Array.from({ length: 6 }, (_, i) =>
      skill({ id: `p${i}`, kind: 'practice', isActive: true }),
    );
    expect(canActivateQuest(target, [...conditioning, target])).toEqual({ ok: true });
    expect(activeQuests([...conditioning, target])).toEqual([]);
  });

  it('refuses to activate a practice skill at all', () => {
    const target = skill({ kind: 'practice' });
    const result = canActivateQuest(target, [target]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('notAQuest');
  });

  it('blocks promoting an inbox item to a quest at the cap, but never to practice', () => {
    // An inactive new quest would satisfy the letter of the cap and defeat it.
    const active = Array.from({ length: MAX_ACTIVE_QUESTS }, (_, i) =>
      withCheckpoint(`a${i}`, `Q${i}`, true),
    );
    const blocked = canPromoteToKind('quest', active);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toContain('Q0, Q1, Q2');
    expect(canPromoteToKind('practice', active)).toEqual({ ok: true });
    expect(canPromoteToKind('quest', active.slice(0, -1))).toEqual({ ok: true });
  });

  it('caps at exactly three, so the constant and the rule cannot drift', () => {
    const active = Array.from({ length: MAX_ACTIVE_QUESTS }, (_, i) =>
      withCheckpoint(`a${i}`, `Q${i}`, true),
    );
    const target = withCheckpoint('t', 'T');
    expect(canActivateQuest(target, [...active.slice(0, -1), target]).ok).toBe(true);
    expect(canActivateQuest(target, [...active, target]).ok).toBe(false);
  });
});

describe('checkpoints', () => {
  it('reports the first open one as next, in order', () => {
    const target = skill({
      checkpoints: [{ ...open('c1'), doneAt: 1 }, open('c2', 'straight arm'), open('c3')],
    });
    expect(nextCheckpoint(target)?.id).toBe('c2');
    expect(checkpointProgress(target)).toEqual({ done: 1, total: 3 });
  });

  it('has no next checkpoint once every one is ticked', () => {
    const target = skill({ checkpoints: [{ ...open('c1'), doneAt: 1 }] });
    expect(nextCheckpoint(target)).toBeNull();
  });
});

describe('staleness', () => {
  it('flags a clean rep untouched for six weeks', () => {
    const rusty = skill({ ladder: 'cleanRep', lastUsedAt: NOW - STALE_AFTER_DAYS * DAY });
    expect(isStale(rusty, NOW)).toBe(true);
    expect(daysSinceUsed(rusty, NOW)).toBe(STALE_AFTER_DAYS);
  });

  it('does not flag the day before the threshold', () => {
    const recent = skill({
      ladder: 'cleanRep',
      lastUsedAt: NOW - (STALE_AFTER_DAYS - 1) * DAY,
    });
    expect(isStale(recent, NOW)).toBe(false);
  });

  it('does not flag a quest below cleanRep — you never had it to lose', () => {
    const never = skill({ ladder: 'drilling', lastUsedAt: NOW - 400 * DAY });
    expect(isStale(never, NOW)).toBe(false);
  });

  it('flags any practice skill on recency alone, since it has no ladder', () => {
    const grip = skill({ kind: 'practice', lastUsedAt: NOW - 100 * DAY });
    expect(isStale(grip, NOW)).toBe(true);
  });

  it('treats never-trained as new, not stale', () => {
    expect(isStale(skill({ ladder: 'cleanRep' }), NOW)).toBe(false);
    expect(daysSinceUsed(skill(), NOW)).toBeNull();
  });

  it('never reports negative days for a session logged today', () => {
    const today = dateKeyOf(new Date(NOW));
    const touched = skill({ lastUsedAt: sessionTimeMs({ date: today }) });
    expect(daysSinceUsed(touched, NOW)).toBe(0);
  });

  it('sorts the practice menu stalest first, with never-trained at the top', () => {
    const menu = practiceMenu(
      [
        skill({ id: 'a', name: 'Handstand', kind: 'practice', lastUsedAt: NOW - 3 * DAY }),
        skill({ id: 'b', name: 'Grip', kind: 'practice' }),
        skill({ id: 'c', name: 'Pendulum', kind: 'practice', lastUsedAt: NOW - 30 * DAY }),
        skill({ id: 'd', name: 'Ayesha' }),
      ],
      NOW,
    );
    expect(menu.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders two never-trained skills deterministically rather than by NaN', () => {
    const first = practiceMenu(
      [
        skill({ id: 'z', name: 'Zig', kind: 'practice' }),
        skill({ id: 'a', name: 'Arch', kind: 'practice' }),
      ],
      NOW,
    );
    expect(first.map((s) => s.id)).toEqual(['a', 'z']);
  });

  it('lists only the flagged skills, stalest first', () => {
    expect(
      staleSkills(
        [
          skill({ id: 'a', ladder: 'cleanRep', lastUsedAt: NOW - 50 * DAY }),
          skill({ id: 'b', ladder: 'cleanRep', lastUsedAt: NOW - 90 * DAY }),
          skill({ id: 'c', ladder: 'cleanRep', lastUsedAt: NOW - 2 * DAY }),
        ],
        NOW,
      ).map((s) => s.id),
    ).toEqual(['b', 'a']);
  });
});

describe('prerequisites', () => {
  it('reports the ones not yet at cleanRep', () => {
    const invert = skill({ id: 'invert', name: 'Invert', ladder: 'inChoreo' });
    const butterfly = skill({ id: 'butterfly', name: 'Butterfly', ladder: 'uglyRep' });
    const ayesha = skill({ id: 'ayesha', requires: ['invert', 'butterfly'] });
    const byId = new Map([invert, butterfly, ayesha].map((s) => [s.id, s]));

    expect(unmetPrerequisites(ayesha, byId).map((s) => s.name)).toEqual(['Butterfly']);
  });

  it('ignores a prerequisite that has been deleted rather than throwing', () => {
    const orphan = skill({ requires: ['gone'] });
    expect(unmetPrerequisites(orphan, new Map())).toEqual([]);
  });
});

describe('date keys', () => {
  it('rejects dates that do not exist', () => {
    expect(isDateKey('2026-02-31')).toBe(false);
    expect(isDateKey('2026-2-3')).toBe(false);
    expect(isDateKey('not a date')).toBe(false);
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
  });

  it('adds days across a month and a year boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('measures whole days between keys, DST or not', () => {
    // The UK springs forward on 2026-03-29; a local-time implementation
    // returns 6 days here, which is the bug this test exists for.
    expect(daysBetweenKeys('2026-03-25', '2026-04-01')).toBe(7);
    expect(daysBetweenKeys('2026-04-01', '2026-03-25')).toBe(-7);
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-08-23')).toBe('2026-08-17'); // a Sunday
    expect(startOfWeek('2026-08-17')).toBe('2026-08-17'); // the Monday itself
    expect(startOfWeek('2026-08-24')).toBe('2026-08-24'); // the next Monday
    expect(isSameWeek('2026-08-17', '2026-08-23')).toBe(true);
    expect(isSameWeek('2026-08-23', '2026-08-24')).toBe(false);
  });
});

describe('the weekly session count', () => {
  const week = [
    session({ id: '1', date: '2026-08-17' }),
    session({ id: '2', date: '2026-08-19' }),
    session({ id: '3', date: '2026-08-19' }),
    session({ id: '4', date: '2026-08-24' }),
  ];

  it('counts distinct days, not entries — two logs on one Saturday is one day', () => {
    expect(trainingDaysInWeekOf(week, '2026-08-23')).toBe(2);
  });

  it('excludes the next week', () => {
    expect(trainingDaysInWeekOf(week, '2026-08-24')).toBe(1);
  });

  it('has a target to measure against', () => {
    expect(DEFAULT_WEEKLY_SESSION_TARGET).toBeGreaterThan(0);
  });

  it('lists a skill’s sessions newest first', () => {
    const history = sessionsForSkill(
      [
        session({ id: 'a', date: '2026-08-01', skillIds: ['s1'] }),
        session({ id: 'b', date: '2026-08-20', skillIds: ['s1', 's2'] }),
        session({ id: 'c', date: '2026-08-21', skillIds: ['s2'] }),
      ],
      's1',
    );
    expect(history.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('logging a session', () => {
  it('bumps recency on every skill it names', () => {
    const skills = [skill({ id: 's1' }), skill({ id: 's2' }), skill({ id: 's3' })];
    const touches = touchesForSession(session({ skillIds: ['s1', 's3'] }), skills);

    expect(touches.map((t) => t.id)).toEqual(['s1', 's3']);
    expect(touches[0]?.lastUsedAt).toBe(sessionTimeMs({ date: '2026-08-22' }));
  });

  it('never moves recency backwards when back-filling an older session', () => {
    const recent = sessionTimeMs({ date: '2026-08-22' });
    const skills = [skill({ id: 's1', lastUsedAt: recent })];
    const touches = touchesForSession(
      session({ date: '2026-07-01', skillIds: ['s1'] }),
      skills,
    );

    expect(touches[0]?.lastUsedAt).toBe(recent);
  });

  it('raises a metric best only when the mark beats it', () => {
    const grip = skill({
      id: 'g',
      kind: 'practice',
      metric: { unit: 'seconds', best: 30, bestAt: 0 },
    });

    const beaten = touchesForSession(session({ skillIds: ['g'], marks: { g: 42 } }), [grip]);
    expect(beaten[0]?.metric).toEqual({
      unit: 'seconds',
      best: 42,
      bestAt: sessionTimeMs({ date: '2026-08-22' }),
    });

    const notBeaten = touchesForSession(session({ skillIds: ['g'], marks: { g: 12 } }), [grip]);
    expect(notBeaten[0]?.metric).toBeUndefined();
  });

  it('ignores a number logged against a skill with no unit configured', () => {
    // 40 what? Without a unit the number is meaningless, so it is not a best.
    const bare = skill({ id: 'b', kind: 'practice' });
    expect(improvedMetric(bare, 40, NOW)).toBeNull();
    expect(
      touchesForSession(session({ skillIds: ['b'], marks: { b: 40 } }), [bare])[0]?.metric,
    ).toBeUndefined();
  });

  it('drops marks for skills the session does not name', () => {
    const built = createSession({
      date: '2026-08-22',
      durationMin: 45,
      felt: 3,
      skillIds: ['a'],
      marks: { a: 10, b: 99 },
    });
    expect(built.marks).toEqual({ a: 10 });
  });

  it('omits empty optional fields rather than storing nulls', () => {
    const built = createSession({
      date: '2026-08-22',
      durationMin: 45.4,
      felt: 1,
      skillIds: [],
      note: '   ',
    });
    expect(built.durationMin).toBe(45);
    expect('note' in built).toBe(false);
    expect('marks' in built).toBe(false);
  });
});

describe('validation', () => {
  const validSession = {
    date: '2026-08-22',
    durationMin: 45,
    felt: 2 as const,
    skillIds: [],
  };

  it('accepts a session with no skills — "trained, nothing in particular" is true', () => {
    expect(validateSession(validSession)).toEqual([]);
  });

  it('rejects a duration that is missing, zero or a typo', () => {
    expect(validateSession({ ...validSession, durationMin: Number.NaN })[0]?.field).toBe(
      'duration',
    );
    expect(validateSession({ ...validSession, durationMin: 0 })[0]?.field).toBe('duration');
    expect(
      validateSession({ ...validSession, durationMin: MAX_SESSION_MINUTES + 1 })[0]?.field,
    ).toBe('duration');
  });

  it('rejects an impossible date', () => {
    expect(validateSession({ ...validSession, date: '2026-02-31' })[0]?.field).toBe('date');
  });

  it('rejects a negative mark', () => {
    expect(validateSession({ ...validSession, marks: { a: -1 } })[0]?.field).toBe('metric');
  });

  it('rejects a blank skill name', () => {
    expect(validateNewSkill({ name: '   ' })[0]?.field).toBe('name');
    expect(validateNewSkill({ name: 'Ayesha' })).toEqual([]);
  });

  it('accepts a bare domain and normalises it to https', () => {
    expect(normalizeUrl('example.com/ayesha')).toBe('https://example.com/ayesha');
    expect(normalizeUrl('  https://example.com/x  ')).toBe('https://example.com/x');
  });

  it('refuses a javascript: url — this field is pasted into without looking', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
    expect(validateInboxItem({ url: 'javascript:alert(1)' })[0]?.field).toBe('url');
  });
});

describe('creating things', () => {
  it('never creates a skill already active — activation has a cap attached', () => {
    const created = createSkill({ name: '  Ayesha  ', kind: 'quest', discipline: 'pole' });
    expect(created.name).toBe('Ayesha');
    expect(created.isActive).toBe(false);
    expect(created.ladder).toBe('wantIt');
    expect(created.checkpoints).toEqual([]);
  });

  it('omits empty optional fields rather than writing undefined', () => {
    const created = createSkill({
      name: 'Grip',
      kind: 'practice',
      discipline: 'pole',
      category: '  ',
      notes: '',
    });
    expect('category' in created).toBe(false);
    expect('notes' in created).toBe(false);
  });

  it('promotes an inbox item, keeping the link and the thing to watch for', () => {
    const item = {
      ...createInboxItem({ url: 'example.com/reel', note: 'watch the hips' }),
      id: 'i1',
    };
    const created = skillFromInboxItem(item, {
      name: 'Shoulder mount',
      kind: 'quest',
      discipline: 'pole',
    });

    expect(created.refs).toEqual([{ url: 'https://example.com/reel', note: 'watch the hips' }]);
    expect(created.isActive).toBe(false);
  });
});
