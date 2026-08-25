import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { layoutSkillGraph } from '../../domain/skillGraph';
import { LADDER, ladderIndex, ladderOf, type Skill } from '../../domain/training';
import type { Id } from '../../domain/types';
import { useTraining } from './useTraining';

/**
 * The skill library as a map rather than a list (ADR 0012 §3).
 *
 * Prerequisites sit above what they unlock. Fill shows ladder state, and edges
 * take the colour of the node they leave — with twenty-odd edges in one
 * picture, "which of these came from Gemini" is what the eye is asking.
 *
 * One tap or click opens the skill. Drag a node sideways to re-slot it within
 * its band when the automatic layout crosses something awkwardly; drag the
 * background to pan. Which *band* a node is in is not draggable — that comes
 * from `requires`, and a node dragged above its own prerequisite would make the
 * picture lie.
 */

const NODE_W = 150;
const NODE_H = 54;
const GAP_X = 30;
const GAP_Y = 84;
const PADDING = 32;

/** Edge colours, cycled by source node so a fan-out is traceable. */
const LINEAGE_COUNT = 6;

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

/**
 * How far a pointer must move before it counts as a drag rather than a click.
 *
 * This is the fix for "tap works, mouse click doesn't": the old version called
 * `setPointerCapture` on pointerdown, which retargets the subsequent `click` to
 * the SVG, so the node's own handler never ran. Nothing is captured until the
 * pointer has actually travelled, so a plain click reaches the node.
 */
const DRAG_THRESHOLD_PX = 5;

interface Placed {
  skill: Skill;
  x: number;
  y: number;
  depth: number;
  order: number;
  lineage: number;
}

interface Point {
  x: number;
  y: number;
}

type Drag =
  | { kind: 'pan' }
  | { kind: 'node'; id: Id; depth: number; from: Point; dx: number };

export function SkillMap() {
  const { skills, actions } = useTraining();
  const navigate = useNavigate();
  const [drag, setDrag] = useState<Drag | null>(null);

  const { placed, edges, loose, extent, bandsById } = useMemo(
    () => buildLayout(skills),
    [skills],
  );

  const { svgRef, view, fit, onPointerDown, onWheel } = usePanZoom(extent, {
    onDragStart: (target) => setDrag(target),
    onDragMove: (dx) => setDrag((current) => (current?.kind === 'node' ? { ...current, dx } : current)),
    onDragEnd: () => {
      setDrag((current) => {
        if (current?.kind === 'node') void commitArrangement(current);
        return null;
      });
    },
  });

  const commitArrangement = useCallback(
    async (dragged: Extract<Drag, { kind: 'node' }>) => {
      const band = bandsById.get(dragged.depth) ?? [];
      const moved = band.find((node) => node.skill.id === dragged.id);
      if (!moved) return;

      const slots = NODE_W + GAP_X;
      const target = clamp(Math.round(moved.order + dragged.dx / slots), 0, band.length - 1);
      if (target === moved.order) return;

      const rest = band.filter((node) => node.skill.id !== dragged.id);
      rest.splice(target, 0, moved);
      await actions.arrangeBand(rest.map((node) => node.skill.id));
    },
    [actions, bandsById],
  );

  useEffect(() => {
    fit();
  }, [fit, extent.width, extent.height]);

  if (placed.length === 0 && loose.length === 0) return null;

  return (
    <div className="map">
      <div className="map__controls">
        <button type="button" className="ghost small" onClick={fit}>
          Fit
        </button>
        <span className="muted small">Drag to pan · pinch to zoom · drag a move to re-slot it</span>
      </div>

      <svg
        ref={svgRef}
        className={`map__canvas${drag ? ' map__canvas--dragging' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onWheel={onWheel}
        role="group"
        aria-label="Skill map"
      >
        <defs>
          {Array.from({ length: LINEAGE_COUNT }, (_, index) => (
            <marker
              key={index}
              id={`arrow-${index}`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path className={`map__arrow map__lineage-${index}`} d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          ))}
        </defs>

        {edges.map((edge, index) => (
          <path
            key={index}
            className={`map__edge map__lineage-${edge.lineage}`}
            d={edgePath(edge.from, edge.to)}
            markerEnd={`url(#arrow-${edge.lineage})`}
            fill="none"
          />
        ))}

        {placed.map((node) => (
          <MapNode
            key={node.skill.id}
            node={node}
            dx={drag?.kind === 'node' && drag.id === node.skill.id ? drag.dx : 0}
            onOpen={() => void navigate(`/training/skills/${node.skill.id}`)}
          />
        ))}
      </svg>

      {loose.length > 0 && (
        <ul className="chip-list map__loose">
          {loose.map((skill) => (
            <li key={skill.id}>
              <button
                type="button"
                className="chip chip--button"
                onClick={() => void navigate(`/training/skills/${skill.id}`)}
              >
                {skill.name}
              </button>
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}

function MapNode({ node, dx, onOpen }: { node: Placed; dx: number; onOpen(): void }) {
  const { skill, x, y, lineage } = node;
  const progress = (ladderIndex(ladderOf(skill)) + 1) / LADDER.length;

  return (
    <g
      className={`map__node map__lineage-${lineage}${skill.isActive ? ' map__node--active' : ''}${
        dx !== 0 ? ' map__node--dragging' : ''
      }`}
      transform={`translate(${x + dx} ${y})`}
      data-skill-id={skill.id}
      data-depth={node.depth}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`${skill.name}, ${ladderOf(skill)}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen();
      }}
    >
      <rect className="map__node-bg" width={NODE_W} height={NODE_H} rx={10} />
      {/* Fill proportional to ladder position: the shape of progress, readable
          when zoomed too far out to read the words. */}
      <rect className="map__node-fill" width={NODE_W * progress} height={NODE_H} rx={10} />
      <rect className="map__node-edge" width={NODE_W} height={NODE_H} rx={10} fill="none" />
      <text className="map__node-label" x={NODE_W / 2} y={NODE_H / 2 + 5}>
        {truncate(skill.name)}
      </text>
    </g>
  );
}

function truncate(name: string, max = 18): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

/**
 * A soft S-curve. Departure and arrival points are fanned across the node's
 * edge rather than all leaving its centre — four edges from one parent drawn
 * from the same point are one thick line until they separate, which is most of
 * what "overlapping connections" looks like.
 */
function edgePath(from: Point & { spread: number }, to: Point & { spread: number }): string {
  const x1 = from.x + NODE_W * from.spread;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W * to.spread;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// --- Layout ----------------------------------------------------------------

function buildLayout(skills: readonly Skill[]) {
  const graph = layoutSkillGraph(skills);
  const byId = new Map(skills.map((skill) => [skill.id, skill]));

  const bandWidths = new Map<number, number>();
  for (const node of graph.nodes) {
    bandWidths.set(node.depth, Math.max(bandWidths.get(node.depth) ?? 0, node.order + 1));
  }
  const widest = graph.width || 1;

  const hueIndex = new Map<Id, number>();
  for (const node of graph.nodes) {
    hueIndex.set(node.id, (node.depth + node.order) % LINEAGE_COUNT);
  }

  const positions = new Map<Id, Point>();
  const placed: Placed[] = [];

  for (const node of graph.nodes) {
    const skill = byId.get(node.id);
    if (!skill) continue;

    const bandCount = bandWidths.get(node.depth) ?? 1;
    const offset = ((widest - bandCount) * (NODE_W + GAP_X)) / 2;
    const x = PADDING + offset + node.order * (NODE_W + GAP_X);
    const y = PADDING + node.depth * (NODE_H + GAP_Y);

    positions.set(node.id, { x, y });
    placed.push({
      skill,
      x,
      y,
      depth: node.depth,
      order: node.order,
      lineage: hueIndex.get(node.id) ?? 0,
    });
  }

  // Fan the endpoints out across each node's edge so parallel edges separate
  // immediately instead of overlapping for half their length.
  const outgoing = new Map<Id, Id[]>();
  const incoming = new Map<Id, Id[]>();
  for (const edge of graph.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  }

  const spread = (siblings: readonly Id[], id: Id): number => {
    if (siblings.length < 2) return 0.5;
    // Sorted by where they sit, so edges do not cross each other on departure.
    const ordered = [...siblings].sort(
      (a, b) => (positions.get(a)?.x ?? 0) - (positions.get(b)?.x ?? 0),
    );
    const index = ordered.indexOf(id);
    return 0.22 + (0.56 * index) / (ordered.length - 1);
  };

  const edges = graph.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return null;
      return {
        from: { ...from, spread: spread(outgoing.get(edge.from) ?? [], edge.to) },
        to: { ...to, spread: spread(incoming.get(edge.to) ?? [], edge.from) },
        lineage: hueIndex.get(edge.from) ?? 0,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

  const bandsById = new Map<number, Placed[]>();
  for (const node of placed) {
    bandsById.set(node.depth, [...(bandsById.get(node.depth) ?? []), node]);
  }
  for (const band of bandsById.values()) band.sort((a, b) => a.order - b.order);

  return {
    placed,
    edges,
    loose: graph.loose.map((id) => byId.get(id)).filter((s): s is Skill => s !== undefined),
    bandsById,
    extent: {
      width: PADDING * 2 + widest * (NODE_W + GAP_X) - GAP_X,
      height: PADDING * 2 + Math.max(graph.bands, 1) * (NODE_H + GAP_Y) - GAP_Y,
    },
  };
}

// --- Pan, zoom and drag ------------------------------------------------------

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragHandlers {
  onDragStart(target: Drag): void;
  onDragMove(dx: number): void;
  onDragEnd(): void;
}

function usePanZoom(extent: { width: number; height: number }, handlers: DragHandlers) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: extent.width, h: extent.height });

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    startClient: Point;
    node: { id: Id; depth: number } | null;
    active: boolean;
  } | null>(null);
  const pinchStart = useRef<{ distance: number; view: View } | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const scale = useCallback(() => {
    const element = svgRef.current;
    if (!element) return 1;
    const box = element.getBoundingClientRect();
    return box.width > 0 ? view.w / box.width : 1;
  }, [view.w]);

  const fit = useCallback(() => {
    const element = svgRef.current;
    if (!element) {
      setView({ x: 0, y: 0, w: extent.width, h: extent.height });
      return;
    }

    const box = element.getBoundingClientRect();
    const aspect = box.height > 0 && box.width > 0 ? box.width / box.height : 1;
    const graphAspect = extent.width / Math.max(extent.height, 1);

    const w = graphAspect > aspect ? extent.width : extent.height * aspect;
    const h = graphAspect > aspect ? extent.width / aspect : extent.height;

    setView({ x: -(w - extent.width) / 2, y: -(h - extent.height) / 2, w, h });
  }, [extent.width, extent.height]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Nothing is captured yet — see DRAG_THRESHOLD_PX. Capturing here is what
    // used to swallow mouse clicks on a node.
    const hit = (event.target as Element).closest?.('[data-skill-id]') ?? null;
    gesture.current = {
      startClient: { x: event.clientX, y: event.clientY },
      node: hit
        ? {
            id: hit.getAttribute('data-skill-id') ?? '',
            depth: Number(hit.getAttribute('data-depth') ?? 0),
          }
        : null,
      active: false,
    };
  }, []);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;

    const onMove = (event: PointerEvent) => {
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;

      const current = { x: event.clientX, y: event.clientY };
      pointers.current.set(event.pointerId, current);
      const active = [...pointers.current.values()];

      if (active.length >= 2 && active[0] && active[1]) {
        const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
        pinchStart.current ??= { distance, view };
        const start = pinchStart.current;
        if (distance > 0 && start.distance > 0) {
          const factor = clamp(start.distance / distance, MIN_SCALE, MAX_SCALE);
          const w = start.view.w * factor;
          const h = start.view.h * factor;
          setView({
            x: start.view.x + (start.view.w - w) / 2,
            y: start.view.y + (start.view.h - h) / 2,
            w,
            h,
          });
        }
        return;
      }

      const held = gesture.current;
      if (!held) return;

      const travelled = Math.hypot(
        current.x - held.startClient.x,
        current.y - held.startClient.y,
      );

      if (!held.active) {
        if (travelled < DRAG_THRESHOLD_PX) return;
        held.active = true;
        // Only now: a captured pointer would have stolen the click.
        element.setPointerCapture(event.pointerId);
        handlersRef.current.onDragStart(
          held.node
            ? { kind: 'node', id: held.node.id, depth: held.node.depth, from: current, dx: 0 }
            : { kind: 'pan' },
        );
      }

      if (held.node) {
        handlersRef.current.onDragMove((current.x - held.startClient.x) * scale());
        return;
      }

      setView((previousView) => ({
        ...previousView,
        x: previousView.x - (current.x - previous.x) * scale(),
        y: previousView.y - (current.y - previous.y) * scale(),
      }));
    };

    const onUp = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;

      const held = gesture.current;
      gesture.current = null;
      // A gesture that never passed the threshold was a click; the browser's
      // own click event has already reached the node.
      if (held?.active) handlersRef.current.onDragEnd();
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);

    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  }, [view, scale]);

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    const factor = clamp(1 + event.deltaY / 500, 0.5, 2);
    setView((previous) => ({
      x: previous.x + (previous.w - previous.w * factor) / 2,
      y: previous.y + (previous.h - previous.h * factor) / 2,
      w: previous.w * factor,
      h: previous.h * factor,
    }));
  }, []);

  return { svgRef, view, fit, onPointerDown, onWheel };
}
