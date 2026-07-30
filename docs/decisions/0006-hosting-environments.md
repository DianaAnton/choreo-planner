# ADR 0006 — One Firebase project; previews via Hosting channels

**Date:** 2026-07-30 · **Status:** accepted

## Context

Options were: one project, two projects (dev/prod), or one project plus the
emulator suite for development.

## Decision

A single Firebase project (`choreo-planner`):

- **prod** — the default Hosting site (`site_id == project_id`), deployed from
  `main` behind a `production` environment approval.
- **PR previews** — Hosting preview channels (`pr-<number>`, 7-day expiry) on
  that same site. Free on every plan, and each PR gets its own URL.
- **staging** — an optional second Hosting site behind
  `enable_staging_site`, defaulting to **false**. Multi-site hosting requires
  the Blaze plan, and preview channels already cover the actual need, so the
  second site is opt-in rather than assumed.

Local development and CI rules tests run against the **Firebase emulator suite**,
so day-to-day work does not touch cloud data either.

## Consequences

- One set of security rules, one Firestore database, one billing surface.
- Preview URLs live under the production hostname
  (`<project>--pr-12-<hash>.web.app`). Acceptable for a personal tool; enabling
  the staging site is the fix if that ever matters.
- PR previews and production share a Firestore database. Acceptable because the
  only writer is the owner and every document is user-scoped; a stray preview
  write lands in the same personal account, not in someone else's data.
- If that stops being acceptable (real users, destructive migrations), the
  upgrade is a second Firebase project and a Terraform workspace — the
  Terraform is already parameterised by `project_id` for that reason.
