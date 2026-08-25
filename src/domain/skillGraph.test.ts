import { describe, expect, it } from 'vitest';

import { layoutSkillGraph, prerequisiteClosure, type GraphNode } from './skillGraph';
import type { Skill } from './training';

/** A quest by construction: it has a checkpoint (ADR 0014). */
function skill(id: string, requires: string[] = [], name = id): Skill {
  return {
    id,
    name,
    discipline: 'pole',
    refs: [],
    ladder: 'wantIt',
    checkpoints: [{ id: `${id}-c`, text: 'do the thing', doneAt: null }],
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
      { ...skill('grip'), checkpoints: [] },
      { ...skill('handstand'), checkpoints: [] },
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
    const { POLE_PATH: STARTING_PATH, inPrerequisiteOrder } = await import('./trainingSeed');

    const skills: Skill[] = inPrerequisiteOrder(STARTING_PATH).map((item) => ({
      ...skill(item.key, [...(item.requires ?? [])], item.name),
      checkpoints: (item.checkpoints ?? []).map((text, i) => ({
        id: `${item.key}-${i}`,
        text,
        doneAt: null,
      })),
    }));

    const graph = layoutSkillGraph(skills);

    expect(graph.bands).toBeGreaterThanOrEqual(4);
    expect(graph.width).toBeGreaterThanOrEqual(3);
    // Conditioning has no prerequisites and nothing depends on it.
    expect(graph.loose.length).toBeGreaterThanOrEqual(5);
    // Every quest with a prerequisite is on the map, not in the loose bucket.
    const questsWithRequires = skills.filter(
      (s) => s.checkpoints.length > 0 && s.requires.length > 0,
    );
    for (const quest of questsWithRequires) {
      expect(graph.loose).not.toContain(quest.id);
    }
  });

  it('places Ayesha below every step of its road', async () => {
    const { POLE_PATH: STARTING_PATH, inPrerequisiteOrder } = await import('./trainingSeed');
    const skills: Skill[] = inPrerequisiteOrder(STARTING_PATH).map((item) => ({
      ...skill(item.key, [...(item.requires ?? [])], item.name),
      checkpoints: (item.checkpoints ?? []).map((text, i) => ({
        id: `${item.key}-${i}`,
        text,
        doneAt: null,
      })),
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

describe('crossing reduction', () => {
  it('is deterministic across runs', () => {
    // The barycentre sweeps must not depend on Map iteration order, or the map
    // reshuffles every time a skill is touched.
    const skills = [
      skill('r1', [], 'Root one'),
      skill('r2', [], 'Root two'),
      skill('a', ['r2'], 'Alpha'),
      skill('b', ['r1'], 'Bravo'),
      skill('c', ['r1', 'r2'], 'Charlie'),
    ];

    const run = () =>
      layoutSkillGraph(skills)
        .nodes.map((n) => `${n.id}@${n.depth}:${n.order}`)
        .sort()
        .join(',');

    expect(run()).toBe(run());
    expect(run()).toBe(run());
  });

  it('pulls a child towards the parent it hangs off', () => {
    // r1 is left, r2 is right. Their children should not end up swapped.
    const graph = layoutSkillGraph([
      skill('r1', [], 'AAA'),
      skill('r2', [], 'ZZZ'),
      skill('childOfR1', ['r1'], 'ZZZ child'),
      skill('childOfR2', ['r2'], 'AAA child'),
    ]);

    const order = (id: string) => graph.nodes.find((n) => n.id === id)?.order ?? -1;
    expect(order('r1')).toBeLessThan(order('r2'));
    // Without barycentre ordering these would sort alphabetically and cross.
    expect(order('childOfR1')).toBeLessThan(order('childOfR2'));
  });
});

describe('manual arrangement', () => {
  const band = () => [
    skill('root'),
    skill('a', ['root'], 'Alpha'),
    skill('b', ['root'], 'Bravo'),
    skill('c', ['root'], 'Charlie'),
  ];

  const orderOf = (graph: ReturnType<typeof layoutSkillGraph>, id: string) =>
    graph.nodes.find((node) => node.id === id)?.order;

  it('puts a dragged node where it was dropped', () => {
    const skills = band();
    // Charlie dragged to the front of its band.
    skills[3] = { ...skills[3]!, mapOrder: 0 };
    skills[1] = { ...skills[1]!, mapOrder: 1 };
    skills[2] = { ...skills[2]!, mapOrder: 2 };

    const graph = layoutSkillGraph(skills);
    expect(orderOf(graph, 'c')).toBe(0);
    expect(orderOf(graph, 'a')).toBe(1);
    expect(orderOf(graph, 'b')).toBe(2);
  });

  it('leaves untouched bands to the heuristic', () => {
    const skills = band();
    const graph = layoutSkillGraph(skills);
    // Nothing has mapOrder, so the band is still a clean 0..n-1.
    expect([orderOf(graph, 'a'), orderOf(graph, 'b'), orderOf(graph, 'c')].sort()).toEqual([
      0, 1, 2,
    ]);
  });

  it('mixes a dragged node with ones that were never touched', () => {
    const skills = band();
    skills[3] = { ...skills[3]!, mapOrder: -1 };

    const graph = layoutSkillGraph(skills);
    expect(orderOf(graph, 'c')).toBe(0);
    // The rest keep a distinct slot each rather than collapsing onto one.
    const slots = ['a', 'b', 'c'].map((id) => orderOf(graph, id));
    expect(new Set(slots).size).toBe(3);
  });

  it('cannot drag a node out of its band — depth stays derived from requires', () => {
    const skills = [
      skill('root'),
      { ...skill('child', ['root']), mapOrder: 99 },
    ];
    const graph = layoutSkillGraph(skills);
    expect(graph.nodes.find((n) => n.id === 'root')?.depth).toBe(0);
    expect(graph.nodes.find((n) => n.id === 'child')?.depth).toBe(1);
  });
});

describe('crossing count on the shipped curricula', () => {
  /** Pairs of edges between the same two bands that cross each other. */
  function crossings(skills: Skill[]): number {
    const graph = layoutSkillGraph(skills);
    const position = new Map(graph.nodes.map((node) => [node.id, node]));
    const edges = graph.edges
      .map((edge) => ({ a: position.get(edge.from), b: position.get(edge.to) }))
      .filter((edge): edge is { a: GraphNode; b: GraphNode } => !!edge.a && !!edge.b);

    let total = 0;
    for (let i = 0; i < edges.length; i += 1) {
      for (let j = i + 1; j < edges.length; j += 1) {
        const e = edges[i]!;
        const f = edges[j]!;
        if (e.a.depth !== f.a.depth) continue;
        if ((e.a.order - f.a.order) * (e.b.order - f.b.order) < 0) total += 1;
      }
    }
    return total;
  }

  async function seeded(which: 'POLE_PATH' | 'SKATEBOARD_PATH'): Promise<Skill[]> {
    const seed = await import('./trainingSeed');
    return seed.inPrerequisiteOrder(seed[which]).map((item) => ({
      ...skill(item.key, [...(item.requires ?? [])], item.name),
      checkpoints: (item.checkpoints ?? []).map((text, i) => ({
        id: `${item.key}-${i}`,
        text,
        doneAt: null,
      })),
    }));
  }

  // Barycentre alone left 1 and 8; the transpose pass takes them to 0 and 7.
  // These are upper bounds, so a layout change that improves them still passes
  // and one that quietly makes the picture worse does not.
  it('draws the pole map with no crossings at all', async () => {
    expect(crossings(await seeded('POLE_PATH'))).toBe(0);
  });

  it('keeps the skate map — the wide one — at or under seven', async () => {
    expect(crossings(await seeded('SKATEBOARD_PATH'))).toBeLessThanOrEqual(7);
  });
});
