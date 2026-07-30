# ADR 0003 — Anonymous auth by default, Google link for sync

**Date:** 2026-07-30 · **Status:** accepted

## Context

Firestore needs an identity. Requiring sign-in before the app does anything is
friction in a studio; requiring nothing makes cross-device sync impossible.

## Decision

Silent anonymous sign-in on first load. A visible "Sign in with Google to sync
across devices" action calls `linkWithPopup`, upgrading the anonymous account in
place — the uid is preserved, so no data migration runs.

## Consequences

- Zero-friction first use; sync is opt-in when it is actually needed.
- Three cases must be handled explicitly, and are the main source of bugs here:
  1. already linked → show the account, offer sign-out;
  2. `auth/credential-already-in-use` → that Google account already owns data.
     Offer to switch to it, and warn that the anonymous project stays on this
     device. Never silently discard data.
  3. popup blocked (common in iOS standalone PWAs) → fall back to
     `linkWithRedirect`.
- Anonymous accounts are deleted by Firebase after 30 days of inactivity if
  auto-cleanup is enabled — leave it **disabled** so an unsynced project cannot
  vanish.
