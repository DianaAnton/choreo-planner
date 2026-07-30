# ADR 0009 — Registries, not conditionals, at the four growth points

**Date:** 2026-07-30 · **Status:** accepted

## Context

v1 is scoped to one dancer planning one pole choreo, but the tool is meant to
grow (other disciplines, richer shape references, export, extra timeline
tracks). The usual failure mode is a `switch` that sprouts a case per feature
until the core component is unreadable.

## Decision

Four named seams, each a registry populated at app start:

| Seam | Shape | v1 entries |
| --- | --- | --- |
| `ShapeSource` | discriminated union on `ShapeEntry.source` + an authoring component per kind | `preset`, `freeText` |
| `TimelineLayer` | `{ id, zIndex, draw(), hitTest? }` over a shared `TimelineViewport` | waveform, beatGrid, sections, shapes, playhead, selection |
| `DisciplineProfile` | preset taxonomy + discipline-specific shape metadata schema | `pole` |
| `Exporter` | `{ id, label, run(project) }` | *(none — seam only)* |

Adding a capability means adding an entry, not editing a core component.

## Consequences

- Slightly more indirection than v1 needs, deliberately.
- The canvas component never grows a per-feature branch; layer order is data.
- `Exporter` ships with no implementations. That is intentional: an empty
  registry costs ~10 lines and prevents export being bolted onto the UI later.
- Registries are populated in `src/app/registry.ts` so the full set of active
  capabilities is readable in one file.
