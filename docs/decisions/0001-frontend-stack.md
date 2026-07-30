# ADR 0001 — Frontend stack: React + Vite + TypeScript

**Date:** 2026-07-30 · **Status:** accepted

## Context

Needed a stack for a canvas-heavy, offline-capable PWA used equally on phone and
laptop. Candidates: React + Vite, SvelteKit, vanilla TS.

## Decision

React 19 + Vite + TypeScript (strict), with `vite-plugin-pwa` for the service
worker, Vitest for unit tests and Playwright for e2e. Zustand for app state —
the timeline needs fast, granular updates that context-per-render would fight.

## Consequences

- Largest ecosystem for the audio/canvas/Firebase pieces; easiest to get help on.
- Bundle is larger than Svelte's, which for an offline-first PWA matters once
  and then never again (precached).
- React's render model is a poor fit for 60 fps canvas drawing, so the timeline
  draws imperatively from a `requestAnimationFrame` loop and only lifts
  *selection* and *edit* state into React. This boundary must stay explicit.
