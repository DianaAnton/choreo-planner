# ADR 0014 — A skill's kind is derived, not asked for

**Date:** 2026-08-25 · **Status:** accepted
**Amends:** [ADR 0011](0011-training-layer.md) §2 (`kind` as a stored, user-set field)

## Context

Quest-versus-practice surfaced as a control in three places — adding a skill,
promoting one from the inbox, and the skill screen — plus, until now, as a split
in two different lists. It was raised as wrong four separate times over the
course of building it, which is a strong enough signal to stop patching the
symptom and look at the model.

Then a check that should have been run much earlier: across all 55 seeded
skills, in both disciplines, **`kind === 'quest'` and "has at least one
checkpoint" agreed in every single case.** Zero mismatches.

That is not a coincidence in the seed data. It is what the two things mean.
Writing down what would count as progress *is* the act of deciding something is
a quest. Asking for a kind on top was asking the same question twice, and then
storing both answers so they could disagree later.

## Decision

**`kind` is derived from checkpoints, and is not a field.**

```ts
export function kindOf(skill: Pick<Skill, 'checkpoints'>): SkillKind {
  return skill.checkpoints.length > 0 ? 'quest' : 'practice';
}
```

`isQuest` and `isPractice` go through it, so every rule that depended on kind —
the WIP cap, the practice menu, staleness, the Today ordering — follows without
knowing anything changed.

Everything ADR 0011 §2 argued for still holds. Two kinds of training still
exist. The cap still governs quests only, so conditioning never competes for the
three slots — a skill with no checkpoints cannot be activated at all, which
`canActivateQuest` already enforced independently. And a handstand still starts
as practice and becomes a quest: by writing a checkpoint against it, which is
the same decision without the extra tap.

**All three toggles are gone**, and with them `SKILL_KIND_LABELS` and the
`setKind` action.

**`canPromoteToKind` is gone too.** It blocked promoting an inbox item to a
quest while three were active. Under derivation a promoted item arrives with no
checkpoints, so it is practice and the rule can never fire. The concern it
existed for — the inbox laundering new quests past the cap — is now structurally
impossible rather than guarded: you cannot promote something into an active
quest, because activation is a separate act with its own check.

**One view.** The Skills screen had a Map/List toggle; the list was a second
rendering of the same data that discarded the only structure worth having, and
two views means every change has to be made twice and look right in both. The
map is the screen. Skills with prerequisites are the graph; the rest are chips
under it.

## Consequences

- Stored skills keep a `kind` field that nothing reads. Harmless — Firestore
  ignores fields absent from the type on read — and it is not worth a migration
  to remove data that costs nothing.
- **The seed no longer declares `kind`.** A seeded skill is a quest exactly when
  it ships checkpoints, which is what the data already said.
- Adding a skill is now one field and one button. Its first checkpoint is what
  promotes it, which is a better prompt than a radio button: it asks *what would
  count as progress* at the moment you are thinking about the skill.
- A quest whose checkpoints are all ticked stays a quest — `checkpoints.length`,
  not the open count. Otherwise finishing one would silently reclassify it as
  conditioning and drop it out of the cap. There is a test for exactly that.
- The category grouping that lived in the list view is gone with it. The map's
  loose chips are ungrouped. If that is missed, group them there rather than
  bringing the list back.
