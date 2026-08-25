# ADR 0012 — Ship a starting curriculum, and a map instead of a list

**Date:** 2026-08-24 · **Status:** accepted
**Supersedes:** [ADR 0011](0011-training-layer.md) §3 (the "no curriculum" clause)

## Context

Phase 2.5 shipped and was used. Two findings, both from the first real session
with it, both about the same thing.

**1. An empty tracker is not a starting point.** ADR 0011 §3 said checkpoints
are user-authored and "the app ships no curriculum". The reasoning was sound in
the abstract — the app should not prescribe training to a body it knows nothing
about — but it put the entire cost of getting started on the one moment when
motivation is lowest and the screen is blank. The seed shipped ten names and no
checkpoints, so a seeded quest could not even be activated until the user
invented one. The user's words: *"I need content to be added there and not have
me manually think and input my training plan."*

ADR 0011's own risk section named this outcome: "an unused tracker is worse
than none". It just did not connect it to the empty-curriculum decision.

**2. A list is the wrong shape for a dependency graph.** Skills carry a
`requires` chain, so the data is a DAG, and rendering a DAG as a flat
alphabetical list throws away the only structure that answers "what is between
me and an Ayesha". On a phone the list is also long, and length reads as
emptiness — a lot of scrolling past things that are not the point. The user:
*"I hate the list view on the phone, I need something I can zoom out and get an
overview of."*

## Decision

**1. Ship a curriculum, and make it obviously editable.** Around 30 skills
across three named goals — Ayesha, Shoulder mount, Handspring — plus the spins,
climbs and conditioning underneath them, each quest carrying two or three
starter checkpoints. Not a syllabus and not authoritative: a default that is
faster to correct than to create.

The original concern stands and is handled by making everything editable rather
than by shipping nothing. Every name, checkpoint and prerequisite can be
changed or deleted.

**2. Move names only; nothing else from anyone else.** Pole move names are the
shared vocabulary of the discipline — Gemini, Butterfly, Shoulder mount, Jade
are used by every school and syllabus, and are not any one site's property.
Descriptions, difficulty ratings, curation and images are. PoleMovebook's
`robots.txt` disallows `/movepage.html`, `/collection.html` and `/combo.html`;
we do not fetch them. ADR 0011's "link out, do not scrape" is unchanged and is
now also a robots directive.

**3. The skill map replaces the list as the primary view.** The `requires`
chain is laid out as a layered graph: prerequisites above, what they unlock
below, ladder state as the node's fill. Pan and pinch-zoom, **one tap to open a
skill**, and a fit-to-screen control — the "zoom out and see the whole thing"
case is the one it is designed for, not an afterthought.

A first version made the first tap select a node and trace its road, and the
second tap open it. It was, correctly, called horrible: a mode you can get
stuck in, on a surface where a tap is also how you pan. There is no selected
state now.

**Edges are coloured by the node they leave.** The first attempt coloured by
root lineage, on the theory that a chain should be one colour end to end. That
measured wrong — every invert, shoulder mount and handspring traces back to
"Basic climb", so the entire web came out in two colours and the complaint it
was meant to fix ("hard to follow by the connections") stood. Per-source
colouring answers the question actually being asked — *which of these came from
Gemini* — and gives six distinct colours over eighteen edges instead of two.
Crossings are reduced by barycentre sweeps rather than a single downward pass,
because a node's position depends on what hangs off it as well as what feeds it.

Layout is computed in `src/domain/skillGraph.ts`, pure and unit-tested, for the
same reason the training rules are: assigning depths in a graph is where the
off-by-one and infinite-loop bugs live, and a component is a bad place to debug
either.

The list survives as a secondary tab. It is still the right shape for "add a
skill" and for conditioning, which has no prerequisites and therefore no
position in a graph.

**4. One list, grouped by what a move is.** The list split into Quests and
Practice: two sections of near-identical rows, which made the screen twice as
long while saying nothing the rows did not already say. It is one list now,
grouped by category — inverts, spins, climbs, conditioning, flexibility — with
kind as a marker on the row. Active quests sit above all of it, because "what
am I doing" should not be filed under C for climb.

**5. One picture per skill, on its own document.** Recognising a shape is
faster than reading its name, and the map and list are both scan-first
surfaces.

Stored as a JPEG data URL on `users/{uid}/skillImages/{skillId}`, downscaled on
the device to a 400px longest edge and capped at 150 KB — comfortably inside
Firestore's 1 MB document limit even after base64's third. **Not on the skill
document**: the skills query runs on every training screen, and thirty embedded
images would be megabytes on mobile data before anything rendered. The image
document is read only when a skill is opened.

Firebase Storage is the right answer at real scale and is not needed at this
one. It would mean a bucket in Terraform, a rules file, upload plumbing, and
the first per-GB cost in the project — for images that exist to be recognised
at a glance. This decision does not block moving there later; it is a different
collection, not a different schema.

Deleting a skill deletes its picture in the same batch. An orphaned image
document is storage nothing will ever read again.

Images may be photographs the user takes or reference pictures they save.
Saving someone else's picture into your own account is a copy rather than the
link ADR 0011 preferred — that is a real distinction, and it is the user's to
make on a private page. Nothing here shares them onward.

**6. Explanatory text comes out.** Nearly every section carried a `.hint`
paragraph explaining the mechanism. Written to be helpful, they read as padding
on a phone and pushed the actual content below the fold — which is how a screen
manages to feel wordy and empty at the same time. The rules stay; the essays
about them go. Where a rule needs explaining, it is explained at the moment it
bites — the WIP cap already does this, in the refusal message.

## Consequences

- ADR 0011 §3's "the app ships no curriculum" no longer holds. Everything else
  in ADR 0011 stands: the ladder, the WIP cap, the two skill kinds, staleness,
  and the collection layout are unchanged.
- The seed is now large enough that writing it one document at a time is a
  visible wait on a phone. `TrainingRepository` gains `newSkillId()` and a
  batched `createSkills()`, so the whole graph lands in one commit — and cannot
  half-land, leaving prerequisites pointing at skills that were never written.
- Shipping opinions means shipping some wrong ones. The progressions are the
  common ones, not the only ones; the checkpoints are a starting position.
  Being wrong in an editable field costs a tap, being empty costs a session.
- **Not decided here:** community- or expert-authored paths. That needs a
  sharing model, provenance, and an import that cannot overwrite your own
  progress — three problems this ADR does not have to solve to be useful.
