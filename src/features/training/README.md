# features/training

Phase 2.5 — see [docs/plan.md](../../../docs/plan.md) and
[ADR 0011](../../../docs/decisions/0011-training-layer.md).

Four screens over `users/{uid}/{skills,sessions,inbox}`: Today, the skill
library, one skill in detail, and the log. Expose this feature's public API from
`index.ts` — other features import from there and never reach into internals.

**The rules are not in here.** The WIP cap, the ladder ordering, staleness and
week boundaries live in [`src/domain/training.ts`](../../domain/training.ts),
pure and unit-tested. Components render refusals; they do not decide them. If
you find yourself writing `if (activeQuests.length >= 3)` in a component, the
rule belongs in the domain instead.
