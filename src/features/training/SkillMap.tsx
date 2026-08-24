import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { layoutSkillGraph } from '../../domain/skillGraph';
import { LADDER, ladderIndex, ladderOf, type Skill } from '../../domain/training';
import type { Id } from '../../domain/types';
import { useTraining } from './useTraining';

/**
 * The skill library as a map rather than a list (ADR 0012 §3). A list throws
 * away the `requires` chain, which is the only thing that answers "what is
 * between me and an Ayesha" — and on a phone it is long, which reads as empty.
 *
 * Prerequisites sit above what they unlock. Fill shows ladder state, and each
 * chain is coloured by the root it descends from — with eighteen edges in one
 * picture, "which line is this" is what the eye is actually asking, and uniform
 * grey never answers it.
 *
 * One tap opens the skill. An earlier version made the first tap select and the
 * second open; it was, correctly, called horrible. Pan with one finger, pinch
 * with two, and "Fit" puts the whole thing back on screen.
 */

// Layout constants, in SVG user units. The viewBox does the scaling, so these
// are a drawing grid rather than pixels.
const NODE_W = 150;
const NODE_H = 54;
const GAP_X = 30;
// Generous: the vertical run is where an edge becomes traceable or doesn't.
const GAP_Y = 84;
const PADDING = 32;

/** Edge colours, cycled by source node so a fan-out is traceable. */
const LINEAGE_COUNT = 6;

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

interface Placed {
  skill: Skill;
  x: number;
  y: number;
  /** Index into the palette, not an id — the renderer only needs the colour. */
  lineage: number;
}

export function SkillMap() {
  const { skills } = useTraining();
  const navigate = useNavigate();

  const { placed, edges, loose, extent } = useMemo(() => {
    const graph = layoutSkillGraph(skills);
    const byId = new Map(skills.map((skill) => [skill.id, skill]));

    // Centre each band against the widest one, so a chain reads as a spine
    // rather than being flush left.
    const bandWidths = new Map<number, number>();
    for (const node of graph.nodes) {
      bandWidths.set(node.depth, Math.max(bandWidths.get(node.depth) ?? 0, node.order + 1));
    }
    const widest = graph.width || 1;

    // Colour by the node an edge *leaves*, not by the root it descends from.
    // Root lineage sounded right and measured wrong: every invert, shoulder
    // mount and handspring traces back to "Basic climb", so the whole web came
    // out one colour. Per-source colouring answers the question actually being
    // asked — which of these lines came from Gemini — and `depth + order` keeps
    // neighbours distinct both across a band and between bands.
    const hueIndex = new Map<Id, number>();
    for (const node of graph.nodes) {
      hueIndex.set(node.id, (node.depth + node.order) % LINEAGE_COUNT);
    }

    const positions = new Map<Id, { x: number; y: number }>();
    const placedNodes: Placed[] = [];

    for (const node of graph.nodes) {
      const skill = byId.get(node.id);
      if (!skill) continue;

      const bandCount = bandWidths.get(node.depth) ?? 1;
      const offset = ((widest - bandCount) * (NODE_W + GAP_X)) / 2;
      const x = PADDING + offset + node.order * (NODE_W + GAP_X);
      const y = PADDING + node.depth * (NODE_H + GAP_Y);

      positions.set(node.id, { x, y });
      placedNodes.push({ skill, x, y, lineage: hueIndex.get(node.id) ?? 0 });
    }

    return {
      placed: placedNodes,
      edges: graph.edges
        .map((edge) => ({
          from: positions.get(edge.from),
          to: positions.get(edge.to),
          lineage: hueIndex.get(edge.from) ?? 0,
        }))
        .filter(
          (
            edge,
          ): edge is {
            from: { x: number; y: number };
            to: { x: number; y: number };
            lineage: number;
          } => edge.from !== undefined && edge.to !== undefined,
        ),
      loose: graph.loose.map((id) => byId.get(id)).filter((s): s is Skill => s !== undefined),
      extent: {
        width: PADDING * 2 + widest * (NODE_W + GAP_X) - GAP_X,
        height: PADDING * 2 + Math.max(graph.bands, 1) * (NODE_H + GAP_Y) - GAP_Y,
      },
    };
  }, [skills]);

  const { svgRef, view, fit, onPointerDown, onWheel } = usePanZoom(extent);

  // Re-fit when the graph's size changes — seeding thirty skills into an empty
  // map should not leave you looking at the top-left corner of it.
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
        <span className="muted small">Drag to pan · pinch to zoom · tap a move</span>
      </div>

      <svg
        ref={svgRef}
        className="map__canvas"
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

        {placed.map(({ skill, x, y, lineage }) => (
          <MapNode
            key={skill.id}
            skill={skill}
            x={x}
            y={y}
            lineage={lineage}
            onOpen={() => void navigate(`/training/skills/${skill.id}`)}
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

/** One tap opens it. There is deliberately no selected state to get stuck in. */
function MapNode({
  skill,
  x,
  y,
  lineage,
  onOpen,
}: {
  skill: Skill;
  x: number;
  y: number;
  lineage: number;
  onOpen(): void;
}) {
  const progress = (ladderIndex(ladderOf(skill)) + 1) / LADDER.length;

  return (
    <g
      className={`map__node map__lineage-${lineage}${
        skill.isActive ? ' map__node--active' : ''
      }`}
      transform={`translate(${x} ${y})`}
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
      <rect
        className="map__node-fill"
        width={NODE_W * progress}
        height={NODE_H}
        rx={10}
      />
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

/** A soft S-curve rather than a straight line — crossings stay readable. */
function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pan and pinch-zoom over an SVG viewBox.
 *
 * Pointer Events rather than touch events: one code path covers mouse, touch
 * and stylus, and `setPointerCapture` keeps a drag alive when the finger
 * leaves the element — which on a small screen it constantly does.
 */
function usePanZoom(extent: { width: number; height: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: extent.width, h: extent.height });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; view: View } | null>(null);

  const fit = useCallback(() => {
    const element = svgRef.current;
    if (!element) {
      setView({ x: 0, y: 0, w: extent.width, h: extent.height });
      return;
    }

    const box = element.getBoundingClientRect();
    // Match the graph's aspect ratio to the element's, so "fit" really does put
    // everything on screen instead of cropping the wider axis.
    const aspect = box.height > 0 && box.width > 0 ? box.width / box.height : 1;
    const graphAspect = extent.width / Math.max(extent.height, 1);

    const w = graphAspect > aspect ? extent.width : extent.height * aspect;
    const h = graphAspect > aspect ? extent.width / aspect : extent.height;

    setView({
      x: -(w - extent.width) / 2,
      y: -(h - extent.height) / 2,
      w,
      h,
    });
  }, [extent.width, extent.height]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }, []);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;

    const scaleFor = () => {
      const box = element.getBoundingClientRect();
      return box.width > 0 ? view.w / box.width : 1;
    };

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
          // Zoom about the middle of the viewBox, which is close enough to the
          // midpoint of two fingers to feel right and much simpler to reason about.
          setView({
            x: start.view.x + (start.view.w - w) / 2,
            y: start.view.y + (start.view.h - h) / 2,
            w,
            h,
          });
        }
        return;
      }

      const scale = scaleFor();
      setView((previousView) => ({
        ...previousView,
        x: previousView.x - (current.x - previous.x) * scale,
        y: previousView.y - (current.y - previous.y) * scale,
      }));
    };

    const onUp = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);

    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  }, [view]);

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
