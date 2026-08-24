import { describe, expect, it } from 'vitest';

import { layoutSkillGraph, prerequisiteClosure } from './skillGraph';
import type { Skill } from './training';

function skill(id: string, requires: string[] = [], name = id): Skill {
  return {
    id,
    name,
    kind: 'quest',
    discipline: 'pole',
    refs: [],
    ladder: 'wantIt',
    checkpoints: [],
    isActive: false,
    requires,
    createdAt: 0,
  };
}

const depthOf = (graph: ReturnType<typeof layoutSkillGraph>, id: string) =>
  graph.nodes.find((node) => node.id === id)?.depth;

describe('layoutSkillGraph', () => {
  it('puts roots at the top and each step one band below', () => {
    const graph = layoutSkillGraph([
      skill('invert'),
      skill('gemini', ['invert']),
      skill('butterfly', ['gemini']),
      skill('ayesha', ['butterfly']),
    ]);

    expect(depthOf(graph, 'invert')).toBe(0);
    expect(depthOf(graph, 'gemini')).toBe(1);
    expect(depthOf(graph, 'butterfly')).toBe(2);
    expect(depthOf(graph, 'ayesha')).toBe(3);
    expect(graph.bands).toBe(4);
    expect(graph.width).toBe(1);
  });

  it('uses the longest path, so a node never floats above a prerequisite', () => {
    // `fast` reaches goal in one step, `slow` in two. Taking the shortest path
    // would place goal at depth 1 — above `slow`, which it depends on.
    const graph = layoutSkillGraph([
      skill('root'),
      skill('fast', ['root']),
      skill('mid', ['root']),
      skill('slow', ['mid']),
      skill('goal', ['fast', 'slow']),
    ]);

    expect(depthOf(graph, 'slow')).toBe(2);
    expect(depthOf(graph, 'goal')).toBe(3);
    for (const parent of ['fast', 'slow']) {
      expect(depthOf(graph, parent)!).toBeLessThan(depthOf(graph, 'goal')!);
    }
  });

  it('separates skills that have no prerequisites and no dependents', () => {
    // Conditioning has no position in a dependency graph: it never ends and
    // nothing waits on it.
    const graph = layoutSkillGraph([
      skill('invert'),
      skill('gemini', ['invert']),
      { ...skill('grip'), kind: 'practice' },
      { ...skill('handstand'), kind: 'practice' },
    ]);

    expect(graph.loose.sort()).toEqual(['grip', 'handstand']);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['gemini', 'invert']);
  });

  it('ignores a prerequisite pointing at a deleted skill', () => {
    const graph = layoutSkillGraph([skill('orphan', ['gone']), skill('child', ['orphan'])]);

    expect(depthOf(graph, 'orphan')).toBe(0);
    expect(depthOf(graph, 'child')).toBe(1);
    expect(graph.edges).toEqual([{ from: 'orphan', to: 'child' }]);
  });

  it('terminates on a cycle instead of hanging the tab', () => {
    // Not reachable through the UI today, but a hand-edited document could do
    // it, and a wrong picture beats a locked-up phone.
    const graph = layoutSkillGraph([skill('a', ['b']), skill('b', ['a']), skill('c', ['a'])]);
    expect(graph.nodes).toHaveLength(3);
    expect(depthOf(graph, 'c')).toBeGreaterThan(0);
  });

  it('gives every node in a band a distinct slot', () => {
    const graph = layoutSkillGraph([
      skill('root'),
      skill('a', ['root'], 'Alpha'),
      skill('b', ['root'], 'Bravo'),
      skill('c', ['root'], 'Charlie'),
    ]);

    const band = graph.nodes.filter((node) => node.depth === 1).map((node) => node.order);
    expect(band.sort()).toEqual([0, 1, 2]);
    expect(graph.width).toBe(3);
  });

  it('orders a band the same way twice — the layout must not reshuffle on render', () => {
    const skills = [skill('root'), skill('z', ['root'], 'Zulu'), skill('a', ['root'], 'Alpha')];
    const first = layoutSkillGraph(skills).nodes.map((n) => `${n.id}:${n.order}`).sort();
    const second = layoutSkillGraph(skills).nodes.map((n) => `${n.id}:${n.order}`).sort();
    expect(first).toEqual(second);
  });

  it('is empty for an empty library rather than throwing', () => {
    const graph = layoutSkillGraph([]);
    expect(graph).toMatchObject({ nodes: [], edges: [], loose: [], width: 0, bands: 0 });
  });
});

describe('prerequisiteClosure', () => {
  it('returns everything on the road to a goal, the goal included', () => {
    const skills = [
      skill('invert'),
      skill('gemini', ['invert']),
      skill('butterfly', ['gemini']),
      skill('ayesha', ['butterfly']),
      skill('unrelated'),
    ];

    expect([...prerequisiteClosure(skills, 'ayesha')].sort()).toEqual([
      'ayesha',
      'butterfly',
      'gemini',
      'invert',
    ]);
  });

  it('terminates on a cycle', () => {
    const skills = [skill('a', ['b']), skill('b', ['a'])];
    expect([...prerequisiteClosure(skills, 'a')].sort()).toEqual(['a', 'b']);
  });
});

describe('the shipped curriculum, laid out', () => {
  it('produces a readable graph rather than a wall or a chain', async () => {
    // Guards the seed against edits that would make the map useless: a single
    // band (everything a root) or a single column (one long chain).
    const { STARTING_PATH, inPrerequisiteOrder } = await import('./trainingSeed');

    const idByKey = new Map(STARTING_PATH.map((item) => [item.key, item.key]));
    const skills: Skill[] = inPrerequisiteOrder(STARTING_PATH).map((item) => ({
      ...skill(item.key, (item.requires ?? []).map((k) => idByKey.get(k) ?? k), item.name),
      kind: item.kind,
    }));

    const graph = layoutSkillGraph(skills);

    expect(graph.bands).toBeGreaterThanOrEqual(4);
    expect(graph.width).toBeGreaterThanOrEqual(3);
    // Conditioning has no prerequisites and nothing depends on it.
    expect(graph.loose.length).toBeGreaterThanOrEqual(5);
    // Every quest with a prerequisite is on the map, not in the loose bucket.
    const questsWithRequires = skills.filter((s) => s.kind === 'quest' && s.requires.length > 0);
    for (const quest of questsWithRequires) {
      expect(graph.loose).not.toContain(quest.id);
    }
  });

  it('places Ayesha below every step of its road', async () => {
    const { STARTING_PATH, inPrerequisiteOrder } = await import('./trainingSeed');
    const skills: Skill[] = inPrerequisiteOrder(STARTING_PATH).map((item) => ({
      ...skill(item.key, [...(item.requires ?? [])], item.name),
      kind: item.kind,
    }));

    const graph = layoutSkillGraph(skills);
    const road = prerequisiteClosure(skills, 'ayesha');
    const ayeshaDepth = graph.nodes.find((n) => n.id === 'ayesha')?.depth ?? -1;

    expect(road.size).toBeGreaterThan(3);
    for (const id of road) {
      if (id === 'ayesha') continue;
      const depth = graph.nodes.find((n) => n.id === id)?.depth ?? -1;
      expect(depth).toBeLessThan(ayeshaDepth);
    }
  });
});
