/**
 * Laying the `requires` chain out as a layered graph. Pure — no React, no DOM.
 *
 * This lives in the domain for the same reason the training rules do: assigning
 * depths in a directed graph is where the off-by-one errors and the infinite
 * loops live, and a component that also handles pinch-zoom is a bad place to
 * debug either. The renderer receives coordinates and draws them.
 */

import type { Skill } from './training';
import type { Id } from './types';

export interface GraphNode {
  id: Id;
  /**
   * Which band the node sits in, 0 at the top. The *longest* path from a root,
   * not the shortest: a skill must appear below every prerequisite it has, and
   * the shortest path would float it above the slowest one.
   */
  depth: number;
  /** Position within the band, left to right. */
  order: number;
}

export interface GraphEdge {
  /** The prerequisite — the node above. */
  from: Id;
  /** What it unlocks — the node below. */
  to: Id;
}

export interface SkillGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * Skills with no prerequisites and nothing depending on them. Conditioning is
   * all of these: it has no position in a dependency graph because it never
   * ends and nothing waits on it. Rendered separately rather than as a row of
   * orphans.
   */
  loose: Id[];
  /** Nodes in the widest band, and the number of bands. Both ≥ 0. */
  width: number;
  bands: number;
}

/**
 * Depth of every node, keyed by id. Cycles cannot be created through the UI
 * today, but a hand-edited document or a future prerequisite picker could
 * produce one, and the honest failure is a slightly wrong picture rather than
 * a locked-up tab — so a back edge contributes nothing and the walk continues.
 */
function depths(byId: ReadonlyMap<Id, Skill>): Map<Id, number> {
  const resolved = new Map<Id, number>();
  const inProgress = new Set<Id>();

  const depthOf = (id: Id): number => {
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;
    if (inProgress.has(id)) return 0;

    const skill = byId.get(id);
    if (!skill) return 0;

    inProgress.add(id);

    let deepest = -1;
    for (const requiredId of skill.requires) {
      // Prerequisites pointing at deleted skills are skipped, not treated as
      // roots — the same tolerance `unmetPrerequisites` has.
      if (!byId.has(requiredId)) continue;
      deepest = Math.max(deepest, depthOf(requiredId));
    }

    inProgress.delete(id);

    const depth = deepest + 1;
    resolved.set(id, depth);
    return depth;
  };

  for (const id of byId.keys()) depthOf(id);
  return resolved;
}

/**
 * Order within each band, by the barycentre method: repeatedly place a node at
 * the average position of its neighbours in the adjacent band, alternating
 * downward and upward.
 *
 * Minimising edge crossings exactly is NP-hard. This is the standard heuristic
 * and it is what turns "hard to follow by the connections" into chains that
 * read as chains — one downward pass was not enough, because a node's position
 * also depends on what hangs off it.
 */
const SWEEPS = 4;

function orderBands(
  bands: Map<number, Id[]>,
  byId: ReadonlyMap<Id, Skill>,
  bandCount: number,
  children: ReadonlyMap<Id, Id[]>,
): Map<Id, number> {
  const order = new Map<Id, number>();

  // Seed alphabetically so the result is stable between renders rather than
  // depending on Map iteration order.
  for (let depth = 0; depth < bandCount; depth += 1) {
    const band = [...(bands.get(depth) ?? [])].sort((a, b) =>
      (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''),
    );
    band.forEach((id, index) => order.set(id, index));
  }

  const neighboursOf = (id: Id, up: boolean): Id[] =>
    up ? [...(byId.get(id)?.requires ?? [])] : [...(children.get(id) ?? [])];

  const sweep = (up: boolean) => {
    const depths = up
      ? [...Array(bandCount).keys()]
      : [...Array(bandCount).keys()].reverse();

    for (const depth of depths) {
      const band = [...(bands.get(depth) ?? [])];

      const positioned = band.sort((a, b) => {
        const meanA = meanNeighbourOrder(a, neighboursOf(a, up), order);
        const meanB = meanNeighbourOrder(b, neighboursOf(b, up), order);
        if (meanA !== meanB) return meanA - meanB;
        // Name breaks ties so a node with no neighbours in the adjacent band
        // does not drift on every sweep.
        return (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? '');
      });

      positioned.forEach((id, index) => order.set(id, index));
    }
  };

  for (let pass = 0; pass < SWEEPS; pass += 1) sweep(pass % 2 === 0);

  return order;
}

function meanNeighbourOrder(
  id: Id,
  neighbours: readonly Id[],
  order: ReadonlyMap<Id, number>,
): number {
  const positions = neighbours
    .map((neighbourId) => order.get(neighbourId))
    .filter((position): position is number => position !== undefined);

  // No neighbours in that direction: hold position rather than sorting to one
  // end, which would drag roots away from what descends from them.
  if (positions.length === 0) return order.get(id) ?? 0;
  return positions.reduce((total, position) => total + position, 0) / positions.length;
}

export function layoutSkillGraph(skills: readonly Skill[]): SkillGraph {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));

  const edges: GraphEdge[] = [];
  const connected = new Set<Id>();

  for (const skill of skills) {
    for (const requiredId of skill.requires) {
      if (!byId.has(requiredId)) continue;
      edges.push({ from: requiredId, to: skill.id });
      connected.add(requiredId);
      connected.add(skill.id);
    }
  }

  const loose = skills.filter((skill) => !connected.has(skill.id)).map((skill) => skill.id);

  const inGraph = new Map([...byId].filter(([id]) => connected.has(id)));
  const depthById = depths(inGraph);

  const bands = new Map<number, Id[]>();
  for (const [id, depth] of depthById) {
    bands.set(depth, [...(bands.get(depth) ?? []), id]);
  }

  const bandCount = bands.size === 0 ? 0 : Math.max(...bands.keys()) + 1;

  const children = new Map<Id, Id[]>();
  for (const edge of edges) {
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }

  const orderById = orderBands(bands, inGraph, bandCount, children);

  const nodes: GraphNode[] = [...depthById].map(([id, depth]) => ({
    id,
    depth,
    order: orderById.get(id) ?? 0,
  }));

  return {
    nodes,
    edges,
    loose,
    width: bandCount === 0 ? 0 : Math.max(...[...bands.values()].map((band) => band.length)),
    bands: bandCount,
  };
}

/**
 * Every skill on the path to a goal, the goal included — what "the road to an
 * Ayesha" actually contains. Used to dim everything else when a node is
 * selected.
 */
export function prerequisiteClosure(skills: readonly Skill[], goalId: Id): Set<Id> {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const found = new Set<Id>();

  const walk = (id: Id): void => {
    if (found.has(id) || !byId.has(id)) return;
    found.add(id);
    for (const requiredId of byId.get(id)?.requires ?? []) walk(requiredId);
  };

  walk(goalId);
  return found;
}
