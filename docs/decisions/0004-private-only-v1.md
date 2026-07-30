# ADR 0004 — Private-only in v1, forward-compatible schema

**Date:** 2026-07-30 · **Status:** accepted

## Context

Sharing was an open question in the brief ("needed if share means someone else
views your project"). Nothing in v1 requires another person to read a project.

## Decision

Security rules are strictly owner-only in v1. The schema nonetheless carries
`ownerId: string` and `members: Record<uid, Role>` (always empty for now) on
every project document from the first write.

## Consequences

- Simplest possible rules to reason about and test.
- Read-only share links and collaborator invites can ship later by adding a
  rules branch and populating `members` — no backfill or migration.
- Rules must reject client writes to `ownerId` and `members` even now, so a
  later sharing feature cannot be retro-exploited on old documents.
