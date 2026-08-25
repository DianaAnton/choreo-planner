import { type FormEvent, useState } from 'react';

import {
  validateNewSkill,
  type TrainingFieldError,
} from '../../domain/training';
import { startingPathFor } from '../../domain/trainingSeed';
import { SkillMap } from './SkillMap';
import { useTraining } from './useTraining';

/**
 * The map, and nothing else.
 *
 * There was a Map/List toggle. The list was a second rendering of the same
 * data that threw away the only structure worth having — and two views means
 * every change has to be made twice and look right in both. The map shows
 * everything: skills with prerequisites in the graph, and the rest as chips
 * under it, grouped by category.
 */
export function SkillsScreen() {
  const { skills, questSlotsLeft } = useTraining();
  const [adding, setAdding] = useState(false);

  if (skills.length === 0) return <SeedPrompt />;

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Skills</h2>
        <span className="muted small">{questSlotsLeft} of 3 slots free</span>
      </div>

      <SkillMap />

      {adding ? (
        <NewSkillForm onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="ghost" onClick={() => setAdding(true)}>
          Add a skill
        </button>
      )}

      <ResetPath />
    </div>
  );
}

function NewSkillForm({ onDone }: { onDone(): void }) {
  const { actions } = useTraining();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<TrainingFieldError[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const found = validateNewSkill({ name });
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      // No quest-or-practice question: a new skill has no checkpoints, so it is
      // practice until you write one. Adding a checkpoint is what makes it a
      // quest, which is the same decision without the extra tap (ADR 0014).
      await actions.createSkill({ name });
      setName('');
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name a move"
        aria-label="Skill name"
        autoFocus
        aria-invalid={errors.length > 0}
      />
      {errors[0] && <p className="field-error">{errors[0].message}</p>}

      <div className="form__actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button type="button" className="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * The empty state, and the only place the seed is offered. Written in one
 * batch with ids minted up front, so `requires` resolves between siblings and
 * the graph cannot half-land.
 */
function SeedPrompt() {
  const { actions, discipline } = useTraining();
  const [seeding, setSeeding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function seed() {
    setSeeding(true);
    setFailure(null);
    try {
      await actions.seedStartingPath();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setSeeding(false);
    }
  }

  const path = startingPathFor(discipline);
  // A seeded skill is a quest exactly when it ships checkpoints (ADR 0014).
  const quests = path.filter((item) => (item.checkpoints?.length ?? 0) > 0).length;
  // The goals are the ends of the chains — whatever this discipline's are,
  // rather than three pole moves hardcoded into the copy.
  const required = new Set(path.flatMap((item) => item.requires ?? []));
  const goals = path
    .filter((item) => !required.has(item.key) && item.requires?.length)
    .map((item) => item.name)
    .slice(0, 3);

  return (
    <section className="card stack">
      <h2>Start from a map</h2>
      <p className="muted">
        {quests} moves
        {goals.length > 1 &&
          ` on the road to ${goals.slice(0, -1).join(', ')} and ${goals.at(-1)}`}
        , plus the conditioning underneath — each with a checkpoint or two to argue with. All of
        it is yours to rename, re-order or delete.
      </p>
      {failure && <p className="field-error">{failure}</p>}
      <div className="form__actions">
        <button type="button" className="primary" onClick={seed} disabled={seeding}>
          {seeding ? 'Building…' : 'Add the starting path'}
        </button>
      </div>
    </section>
  );
}

/**
 * Clear every skill in the active discipline.
 *
 * This exists because the curriculum is still being tuned: re-seeding after a
 * change means deleting thirty skills, and doing that one confirmation at a
 * time is not a workflow anyone follows — they just stop re-seeding and test
 * against stale data instead.
 *
 * Two taps, and the second one names what it is about to destroy. Sessions are
 * left alone: the log is a record of what you did, and deleting the skills does
 * not mean those days did not happen.
 */
function ResetPath() {
  const { skills, profile, actions } = useTraining();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (skills.length === 0) return null;

  if (!confirming) {
    return (
      <button type="button" className="ghost small" onClick={() => setConfirming(true)}>
        Reset {profile.label.toLowerCase()} path
      </button>
    );
  }

  return (
    <div className="card stack">
      <p className="small">
        Delete all {skills.length} {profile.label.toLowerCase()} skills, their checkpoints and
        their pictures? Your session history stays.
      </p>
      {failure && <p className="field-error">{failure}</p>}
      <div className="form__actions">
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailure(null);
            try {
              await actions.resetDiscipline();
              setConfirming(false);
            } catch (error) {
              setFailure(error instanceof Error ? error.message : String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Deleting…' : `Delete ${skills.length}`}
        </button>
        <button type="button" className="ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Keep them
        </button>
      </div>
    </div>
  );
}
