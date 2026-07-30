import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BPM } from '../domain/project';
import { InMemoryProjectRepository } from './InMemoryProjectRepository';

const input = { title: 'Code Mistake', discipline: 'pole', bpm: DEFAULT_BPM };

describe('InMemoryProjectRepository', () => {
  let clock: number;
  let repo: InMemoryProjectRepository;

  beforeEach(() => {
    clock = 1000;
    repo = new InMemoryProjectRepository('alice', () => clock);
  });

  it('creates a project owned by the current user', async () => {
    const project = await repo.create(input);
    expect(project.ownerId).toBe('alice');
    expect(project.title).toBe('Code Mistake');
    expect(await repo.get(project.id)).toEqual(project);
  });

  it('returns null for a project that does not exist, rather than throwing', async () => {
    expect(await repo.get('nope')).toBeNull();
  });

  it('lists most-recently-updated first', async () => {
    const first = await repo.create({ ...input, title: 'First' });
    clock = 2000;
    const second = await repo.create({ ...input, title: 'Second' });

    expect((await repo.list()).map((p) => p.id)).toEqual([second.id, first.id]);

    clock = 3000;
    await repo.update(first.id, { title: 'First, edited' });
    expect((await repo.list()).map((p) => p.id)).toEqual([first.id, second.id]);
  });

  it('hides other users’ projects', async () => {
    await repo.create(input);
    const bob = new InMemoryProjectRepository('bob', () => clock);
    expect(await bob.list()).toEqual([]);
  });

  it('pushes an immediate value to new list subscribers', async () => {
    await repo.create(input);
    const seen = vi.fn();
    repo.subscribeList(seen);

    // Without this, a freshly-mounted list renders empty until something else
    // changes — the bug this assertion exists to prevent.
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('notifies list subscribers on create, update and delete', async () => {
    const seen = vi.fn();
    repo.subscribeList(seen);

    const project = await repo.create(input);
    await repo.update(project.id, { title: 'Renamed' });
    await repo.remove(project.id);

    expect(seen).toHaveBeenCalledTimes(4); // initial + three mutations
    expect(seen.mock.lastCall?.[0]).toEqual([]);
  });

  it('stops notifying after unsubscribe', async () => {
    const seen = vi.fn();
    const unsubscribe = repo.subscribeList(seen);
    unsubscribe();

    await repo.create(input);
    expect(seen).toHaveBeenCalledTimes(1); // just the initial emit
  });

  it('streams a single project, including its deletion as null', async () => {
    const project = await repo.create(input);
    const seen = vi.fn();
    repo.subscribe(project.id, seen);

    await repo.remove(project.id);
    expect(seen.mock.lastCall?.[0]).toBeNull();
  });

  it('bumps updatedAt on update without touching createdAt', async () => {
    const project = await repo.create(input);
    clock = 5000;
    await repo.update(project.id, { title: 'Renamed' });

    const updated = await repo.get(project.id);
    expect(updated?.createdAt).toBe(1000);
    expect(updated?.updatedAt).toBe(5000);
  });

  it('rejects updates to a project that is gone', async () => {
    await expect(repo.update('nope', { title: 'x' })).rejects.toThrow();
  });
});
