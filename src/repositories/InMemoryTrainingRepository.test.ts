import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionTimeMs, type Skill } from '../domain/training';
import { InMemoryTrainingRepository } from './InMemoryTrainingRepository';

const quest = { name: 'Ayesha', kind: 'quest' as const, discipline: 'pole' };
const practice = { name: 'Grip', kind: 'practice' as const, discipline: 'pole' };

describe('InMemoryTrainingRepository', () => {
  let clock: number;
  let repo: InMemoryTrainingRepository;

  beforeEach(() => {
    clock = 1000;
    repo = new InMemoryTrainingRepository(() => clock);
  });

  describe('skills', () => {
    it('creates a skill that is not active — activation is a separate decision', async () => {
      const skill = await repo.createSkill(quest);
      expect(skill.name).toBe('Ayesha');
      expect(skill.isActive).toBe(false);
      expect(skill.createdAt).toBe(1000);
    });

    it('lists alphabetically, so a picker is scannable', async () => {
      await repo.createSkill({ ...quest, name: 'Shoulder mount' });
      await repo.createSkill({ ...quest, name: 'Ayesha' });
      await repo.createSkill({ ...quest, name: 'Inverted D' });

      const seen = vi.fn();
      repo.subscribeSkills('pole', seen);
      expect(seen.mock.lastCall?.[0].map((s: Skill) => s.name)).toEqual([
        'Ayesha',
        'Inverted D',
        'Shoulder mount',
      ]);
    });

    it('hides another discipline’s skills', async () => {
      await repo.createSkill(quest);
      await repo.createSkill({ ...quest, name: 'Hoop thing', discipline: 'hoop' });

      const seen = vi.fn();
      repo.subscribeSkills('hoop', seen);
      expect(seen.mock.lastCall?.[0].map((s: Skill) => s.name)).toEqual(['Hoop thing']);
    });

    it('pushes an immediate value to a new subscriber, then live updates', async () => {
      const seen = vi.fn();
      repo.subscribeSkills('pole', seen);
      expect(seen).toHaveBeenCalledWith([]);

      await repo.createSkill(quest);
      expect(seen.mock.lastCall?.[0]).toHaveLength(1);
    });

    it('stops notifying after unsubscribe', async () => {
      const seen = vi.fn();
      repo.subscribeSkills('pole', seen)();

      await repo.createSkill(quest);
      expect(seen).toHaveBeenCalledTimes(1);
    });

    it('drops a deleted skill from another skill’s prerequisites', async () => {
      const invert = await repo.createSkill({ ...quest, name: 'Invert' });
      const ayesha = await repo.createSkill({ ...quest, requires: [invert.id] });

      await repo.removeSkill(invert.id);

      const seen = vi.fn();
      repo.subscribeSkills('pole', seen);
      const remaining: Skill[] = seen.mock.lastCall?.[0];
      expect(remaining.map((s) => s.id)).toEqual([ayesha.id]);
      expect(remaining[0]?.requires).toEqual([]);
    });
  });

  describe('logging a session', () => {
    it('records it and touches every skill it names, in one call', async () => {
      const ayesha = await repo.createSkill(quest);
      const grip = await repo.createSkill(practice);
      const untouched = await repo.createSkill({ ...quest, name: 'Untouched' });

      const skillsSeen = vi.fn();
      repo.subscribeSkills('pole', skillsSeen);

      await repo.logSession(
        { date: '2026-08-22', durationMin: 50, felt: 3, skillIds: [ayesha.id, grip.id] },
        [ayesha, grip, untouched],
      );

      const after: Skill[] = skillsSeen.mock.lastCall?.[0];
      const byId = new Map(after.map((s) => [s.id, s]));
      expect(byId.get(ayesha.id)?.lastUsedAt).toBe(sessionTimeMs({ date: '2026-08-22' }));
      expect(byId.get(grip.id)?.lastUsedAt).toBe(sessionTimeMs({ date: '2026-08-22' }));
      expect(byId.get(untouched.id)?.lastUsedAt).toBeUndefined();
    });

    it('raises a metric best when the mark beats it', async () => {
      const grip = await repo.createSkill({
        ...practice,
        metric: { unit: 'seconds', best: 30, bestAt: 0 },
      });

      await repo.logSession(
        {
          date: '2026-08-22',
          durationMin: 20,
          felt: 2,
          skillIds: [grip.id],
          marks: { [grip.id]: 45 },
        },
        [grip],
      );

      const seen = vi.fn();
      repo.subscribeSkills('pole', seen);
      expect(seen.mock.lastCall?.[0][0].metric.best).toBe(45);
    });

    it('returns only sessions from the requested date forward, newest first', async () => {
      for (const date of ['2026-07-01', '2026-08-17', '2026-08-22']) {
        await repo.logSession({ date, durationMin: 30, felt: 2, skillIds: [] }, []);
      }

      const seen = vi.fn();
      repo.subscribeSessions('2026-08-17', seen);
      expect(seen.mock.lastCall?.[0].map((s: { date: string }) => s.date)).toEqual([
        '2026-08-22',
        '2026-08-17',
      ]);
    });

    it('leaves recency alone when a session is deleted', async () => {
      const ayesha = await repo.createSkill(quest);
      const logged = await repo.logSession(
        { date: '2026-08-22', durationMin: 50, felt: 3, skillIds: [ayesha.id] },
        [ayesha],
      );

      await repo.removeSession(logged.id);

      const seen = vi.fn();
      repo.subscribeSkills('pole', seen);
      // Deleting a mistyped entry must not resurrect a staleness flag.
      expect(seen.mock.lastCall?.[0][0].lastUsedAt).toBe(sessionTimeMs({ date: '2026-08-22' }));
    });
  });

  describe('the inbox', () => {
    it('captures a link, newest first', async () => {
      await repo.addInboxItem({ url: 'example.com/one' });
      clock = 2000;
      await repo.addInboxItem({ url: 'example.com/two', note: 'watch the hips' });

      const seen = vi.fn();
      repo.subscribeInbox(seen);
      expect(seen.mock.lastCall?.[0].map((i: { url: string }) => i.url)).toEqual([
        'https://example.com/two',
        'https://example.com/one',
      ]);
    });

    it('promotes an item to a skill and clears it from the inbox together', async () => {
      const item = await repo.addInboxItem({ url: 'example.com/reel', note: 'watch the hips' });

      const inboxSeen = vi.fn();
      repo.subscribeInbox(inboxSeen);

      const skill = await repo.promoteInboxItem(item, { ...quest, name: 'Shoulder mount' });

      expect(skill.refs).toEqual([{ url: 'https://example.com/reel', note: 'watch the hips' }]);
      expect(inboxSeen.mock.lastCall?.[0]).toEqual([]);
    });

    it('discards an item without creating anything', async () => {
      const item = await repo.addInboxItem({ url: 'example.com/nope' });
      await repo.removeInboxItem(item.id);

      const inboxSeen = vi.fn();
      const skillsSeen = vi.fn();
      repo.subscribeInbox(inboxSeen);
      repo.subscribeSkills('pole', skillsSeen);

      expect(inboxSeen.mock.lastCall?.[0]).toEqual([]);
      expect(skillsSeen.mock.lastCall?.[0]).toEqual([]);
    });
  });
});

describe('batched skill creation', () => {
  let repo: InMemoryTrainingRepository;

  beforeEach(() => {
    repo = new InMemoryTrainingRepository(() => 1000);
  });

  it('resolves prerequisites between siblings written in the same commit', async () => {
    // Ids are minted before anything is written, which is the whole point:
    // `requires` can point at a skill that does not exist yet.
    const invertId = repo.newSkillId();
    const geminiId = repo.newSkillId();

    const created = await repo.createSkills([
      { id: invertId, name: 'Basic invert', kind: 'quest', discipline: 'pole' },
      { id: geminiId, name: 'Gemini', kind: 'quest', discipline: 'pole', requires: [invertId] },
    ]);

    expect(created.map((s) => s.id)).toEqual([invertId, geminiId]);
    expect(created[1]?.requires).toEqual([invertId]);
  });

  it('mints a distinct id every call', () => {
    const ids = [repo.newSkillId(), repo.newSkillId(), repo.newSkillId()];
    expect(new Set(ids).size).toBe(3);
  });

  it('emits one update for the whole batch, not one per skill', async () => {
    const seen = vi.fn();
    repo.subscribeSkills('pole', seen);
    seen.mockClear();

    await repo.createSkills(
      ['a', 'b', 'c'].map((name) => ({
        id: repo.newSkillId(),
        name,
        kind: 'quest' as const,
        discipline: 'pole',
      })),
    );

    // The Firestore batch lands as a single snapshot; a test that saw three
    // would be testing a fiction.
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.lastCall?.[0]).toHaveLength(3);
  });

  it('does nothing for an empty batch', async () => {
    expect(await repo.createSkills([])).toEqual([]);
  });
});

describe('skill images', () => {
  let repo: InMemoryTrainingRepository;

  beforeEach(() => {
    repo = new InMemoryTrainingRepository(() => 1000);
  });

  const tiny = 'data:image/jpeg;base64,/9j/4AAQ';

  it('stores and streams a picture for one skill', async () => {
    const skill = await repo.createSkill(quest);
    const seen = vi.fn();
    repo.subscribeSkillImage(skill.id, seen);
    expect(seen).toHaveBeenCalledWith(null);

    await repo.setSkillImage(skill.id, tiny);
    expect(seen.mock.lastCall?.[0]).toEqual({ dataUrl: tiny, updatedAt: 1000 });
  });

  it('refuses one that would not fit on a Firestore document', async () => {
    const skill = await repo.createSkill(quest);
    const huge = `data:image/jpeg;base64,${'A'.repeat(200_000)}`;
    await expect(repo.setSkillImage(skill.id, huge)).rejects.toThrow(/too large/);
  });

  it('refuses something that is not an image at all', async () => {
    const skill = await repo.createSkill(quest);
    await expect(repo.setSkillImage(skill.id, 'javascript:alert(1)')).rejects.toThrow();
  });

  it('deletes the picture with the skill rather than orphaning it', async () => {
    const skill = await repo.createSkill(quest);
    await repo.setSkillImage(skill.id, tiny);

    const seen = vi.fn();
    repo.subscribeSkillImage(skill.id, seen);
    await repo.removeSkill(skill.id);

    expect(seen.mock.lastCall?.[0]).toBeNull();
  });

  it('keeps one skill’s picture out of another’s subscription', async () => {
    const a = await repo.createSkill(quest);
    const b = await repo.createSkill({ ...quest, name: 'Other' });

    const seenB = vi.fn();
    repo.subscribeSkillImage(b.id, seenB);
    seenB.mockClear();

    await repo.setSkillImage(a.id, tiny);
    expect(seenB).not.toHaveBeenCalled();
  });
});

describe('resetting a discipline', () => {
  let repo: InMemoryTrainingRepository;

  beforeEach(() => {
    repo = new InMemoryTrainingRepository(() => 1000);
  });

  it('deletes many skills and their pictures in one go', async () => {
    const a = await repo.createSkill(quest);
    const b = await repo.createSkill({ ...quest, name: 'Other' });
    await repo.setSkillImage(a.id, 'data:image/jpeg;base64,/9j/4AAQ');

    const skillsSeen = vi.fn();
    const imageSeen = vi.fn();
    repo.subscribeSkills('pole', skillsSeen);
    repo.subscribeSkillImage(a.id, imageSeen);
    skillsSeen.mockClear();

    await repo.removeSkills([a.id, b.id]);

    expect(skillsSeen.mock.lastCall?.[0]).toEqual([]);
    expect(imageSeen.mock.lastCall?.[0]).toBeNull();
    // One emit for the batch, mirroring the Firestore commit.
    expect(skillsSeen).toHaveBeenCalledTimes(1);
  });

  it('leaves the other discipline alone', async () => {
    const pole = await repo.createSkill(quest);
    const skate = await repo.createSkill({ ...quest, name: 'Ollie', discipline: 'skateboard' });

    await repo.removeSkills([pole.id]);

    const seen = vi.fn();
    repo.subscribeSkills('skateboard', seen);
    expect(seen.mock.lastCall?.[0].map((s: { id: string }) => s.id)).toEqual([skate.id]);
  });

  it('leaves the session log alone — those days still happened', async () => {
    const skill = await repo.createSkill(quest);
    await repo.logSession(
      { date: '2026-08-22', durationMin: 45, felt: 2, skillIds: [skill.id] },
      [skill],
    );

    await repo.removeSkills([skill.id]);

    const seen = vi.fn();
    repo.subscribeSessions('2026-08-01', seen);
    expect(seen.mock.lastCall?.[0]).toHaveLength(1);
  });

  it('does nothing for an empty list', async () => {
    await repo.createSkill(quest);
    await repo.removeSkills([]);

    const seen = vi.fn();
    repo.subscribeSkills('pole', seen);
    expect(seen.mock.lastCall?.[0]).toHaveLength(1);
  });
});
