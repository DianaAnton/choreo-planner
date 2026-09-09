# ADR 0015 — A session plan is derived, and the goal is not what you train

**Date:** 2026-09-09 · **Status:** accepted
**Builds on:** [ADR 0011](0011-training-layer.md) (the ladder and the WIP cap),
[ADR 0012](0012-ship-a-starting-curriculum.md) (the `requires` chain),
[ADR 0013](0013-two-disciplines.md) (`DisciplineProfile` owns the wording)

## Context

The tracker could answer "what have I done" and "what am I working on". It
could not answer the question that actually stops a session before it starts:
**I have fifty minutes, what do I do with them?**

Today gives you an ordered list of skills. A list is not a session. It has no
warm-up, no shape, no sense of how long anything takes, and — the part that
matters most — no opinion about what is worth doing *first* when the thing you
want is four rungs above what you can hold.

Everything needed to answer it was already stored. The `requires` chain from
ADR 0012 says what sits under what. `PREREQUISITE_MET_AT` from ADR 0011 already
defines "actually there" as `cleanRep`, the one rung with an objective test.
Nothing new had to be persisted; the answer only had to be computed.

## Decision

### 1. You train the nearest unmet prerequisite, not the goal

`trainableTowards` walks down a goal's `requires` chain and returns the skills
whose own prerequisites are all met but which are not met themselves.

An Ayesha on top of an extended butterfly, a butterfly, a gemini and a shaky
invert resolves to **the invert**. That is the honest answer, it is four rungs
below the exciting one, and it is the answer nobody gives themselves.

`frontier` does this across every active quest at once and orders the result by
**how many goals are waiting on each step**. A shoulder mount and an Ayesha both
sit on a clean invert, which makes the invert the single highest-leverage thing
in the session — worth more of the fifty minutes than either goal is. Staleness
breaks the tie.

The quest cap still decides *what* you are chasing. The planner never activates
anything and never routes around the cap: with nothing active there is no goal
work, and the screen says so rather than quietly picking for you.

### 2. The shape of a session belongs to the discipline

`DisciplineProfile` gains a required `sessionShape`: an ordered list of lanes,
each either **fixed** (a duration and nothing else) or a **share** of what is
left, drawn either from the frontier or from named categories.

Required, with no default. A neutral fallback would be a guess at somebody's
training order, and "conditioning last, because it burns out the grip the pole
work needs" is a fact about pole, not about training. A discipline added
without thinking about its session should not compile — which is the same
argument as ADR 0013, one seam further along.

For pole the order is warm-up, goal work, spins and shapes, conditioning,
cool-down. Conditioning is deliberately **last**: grip and scapular work is
what burns out the hands the inverted work needs, so putting it first buys a
tired session in exchange for feeling productive early.

### 3. Warm-up and cool-down are a tick

A fixed lane holds minutes and no content. You already know your warm-up; an
app listing it back at you is noise in the one place that has to stay quiet.
This came directly from the ask, and it turned out to be the cleanest way to
model "time that is part of the session but is not a skill".

### 4. The minutes always add up

Blocks are allocated by largest remainder, so a fifty-minute plan comes to
exactly fifty. Rounding each share independently is how you get 49 or 51, and
the total is the one thing a written plan is not allowed to get wrong.

A lane with nothing to offer is dropped before allocation and its minutes go to
the rest of the session, not to an empty heading. Lanes that cannot clear a
four-minute floor are dropped lightest-first: three three-minute blocks is not
a shorter session, it is a worse one.

### 5. Nothing is stored

A plan is derived from the skills you have and the time you have, exactly as
`todayList` is. It lives in `TrainingProvider` for as long as you are working
through it, and the thing worth keeping out of a session is **the session**,
which the Log screen already writes.

Persisting plans would mean a fourth collection, its own rules, its own
migration and a `schemaVersion` bump, to remember something whose entire life
is the next fifty minutes. Finishing a plan hands its ticked blocks to the Log
screen — skills and minutes prefilled — and that write is the durable record.

The plan is **frozen when you build it**, not recomputed as the live skill list
changes. A plan that rewrote itself halfway through because you ticked a
checkpoint would not be a plan. The skills it *names* stay live, so the cue on
each row updates as you go.

## Consequences

- **Ticks are lost on reload.** In-memory state survives navigating to a skill
  and back, which is the case that actually happens mid-session, but not a
  refresh. The honest fix is to log the session, which is the point.
- **The Log screen gained a prefill.** `initial` is a starting point, not a
  submission — what you ticked and what you did are not always the same, and
  every field stays editable.
- **Conditioning rotates by staleness, not by relevance.** The plan cannot
  know that scapular work serves a shoulder mount, because conditioning skills
  have no `requires` edges — they are `loose` in the graph by design. Stalest
  first is a decent proxy and it self-corrects as sessions are logged. Wiring
  conditioning into the dependency graph would be a real modelling change and
  is not made here.
- **Flexibility is not in the pole plan.** Drawn from `['conditioning',
  'flexibility']`, a stalest-first pick reliably filled the strength block with
  a bridge and some ankle work. Stretching belongs either side of the session,
  where the warm-up and cool-down already are.
- **`sessionShape` is required**, so both shipped profiles had to declare one
  and both test fixtures had to be updated. That is the seam working.
- Still no charts, no streaks, no total hours — the Phase 2.5 risk stands. The
  plan screen shows minutes done out of minutes planned *for the session in
  front of you*, and nothing that accumulates.
