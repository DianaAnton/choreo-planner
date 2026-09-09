# features/training

Phase 2.5 — see [docs/plan.md](../../../docs/plan.md) and
[ADR 0011](../../../docs/decisions/0011-training-layer.md).

Five screens over `users/{uid}/{skills,sessions,inbox}`: Today, the session
plan, the skill library, one skill in detail, and the log. Expose this feature's
public API from `index.ts` — other features import from there and never reach
into internals.

**The rules are not in here.** The WIP cap, the ladder ordering, staleness and
week boundaries live in [`src/domain/training.ts`](../../domain/training.ts),
pure and unit-tested. Components render refusals; they do not decide them. If
you find yourself writing `if (activeQuests.length >= 3)` in a component, the
rule belongs in the domain instead.

The same goes for the session plan: what to train and how the minutes divide is
[`src/domain/sessionPlan.ts`](../../domain/sessionPlan.ts), and the shape of a
session belongs to the `DisciplineProfile` in
[`src/app/registry.ts`](../../app/registry.ts), never to the screen. See
[ADR 0015](../../../docs/decisions/0015-session-plans-are-derived.md).

The plan itself is not persisted. It lives in `TrainingProvider` while you work
through it — high enough that tapping into a skill and back does not lose your
ticks — and the durable record is the session the Log screen writes.
