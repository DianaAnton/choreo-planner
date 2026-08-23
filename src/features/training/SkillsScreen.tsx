import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';

import {
  SKILL_KIND_LABELS,
  checkpointProgress,
  daysSinceUsed,
  ladderOf,
  validateNewSkill,
  type Skill,
  type SkillKind,
  type TrainingFieldError,
} from '../../domain/training';
import { AYESHA_ROAD, inPrerequisiteOrder } from '../../domain/trainingSeed';
import { LadderMeter } from './LadderMeter';
import { useTraining } from './useTraining';

/** The whole library — quests above practice, because that is the order of attention. */
export function SkillsScreen() {
  const { skills, questSlotsLeft } = useTraining();

  const quests = skills.filter((skill) => skill.kind === 'quest');
  const practice = skills.filter((skill) => skill.kind === 'practice');

  return (
    <div className="stack">
      <NewSkillForm />

      {skills.length === 0 && <SeedPrompt />}

      {quests.length > 0 && (
        <section className="stack">
          <div className="section-head">
            <h2>Quests</h2>
            <span className="muted small">{questSlotsLeft} of 3 slots free</span>
          </div>
          <ul className="stack">
            {[...quests].sort(activeFirst).map((skill) => (
              <SkillRow key={skill.id} skill={skill} />
            ))}
          </ul>
        </section>
      )}

      {practice.length > 0 && (
        <section className="stack">
          <h2>Practice</h2>
          <ul className="stack">
            {practice.map((skill) => (
              <SkillRow key={skill.id} skill={skill} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function activeFirst(a: Skill, b: Skill): number {
  return Number(b.isActive) - Number(a.isActive);
}

function SkillRow({ skill }: { skill: Skill }) {
  const { done, total } = checkpointProgress(skill);
  const days = daysSinceUsed(skill);

  return (
    <li className="card skill-row">
      <Link to={`/training/skills/${skill.id}`} className="skill-row__link">
        <span className="skill-row__name">
          {skill.name}
          {skill.isActive && <span className="badge">active</span>}
        </span>
        {skill.kind === 'quest' ? (
          <LadderMeter state={ladderOf(skill)} />
        ) : (
          <span className="muted small">
            {skill.metric ? `best ${skill.metric.best} ${skill.metric.unit}` : 'practice'}
          </span>
        )}
        <span className="muted small">
          {skill.kind === 'quest' && total > 0 && `${done}/${total} checkpoints · `}
          {days === null ? 'never trained' : `${days}d since`}
        </span>
      </Link>
    </li>
  );
}

function NewSkillForm() {
  const { actions } = useTraining();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SkillKind>('quest');
  const [errors, setErrors] = useState<TrainingFieldError[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const found = validateNewSkill({ name });
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      // No cap check here: a new skill is created parked. Activating it is the
      // decision the cap governs, and it goes through `canActivateQuest`.
      await actions.createSkill({ name, kind });
      setName('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="skill-name">Add a skill</label>
      <input
        id="skill-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Shoulder mount"
        aria-invalid={errors.length > 0}
      />
      {errors[0] && <p className="field-error">{errors[0].message}</p>}

      <div className="chip-row">
        {(['quest', 'practice'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip chip--button${kind === option ? ' chip--on' : ''}`}
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
          >
            {SKILL_KIND_LABELS[option]}
          </button>
        ))}
        <button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  );
}

/**
 * Offered once, on an empty library. Writes the chain prerequisites-first so
 * each `requires` can point at a real id.
 */
function SeedPrompt() {
  const { actions } = useTraining();
  const [seeding, setSeeding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function seed() {
    setSeeding(true);
    setFailure(null);

    const idByKey = new Map<string, string>();
    try {
      for (const item of inPrerequisiteOrder(AYESHA_ROAD)) {
        const created = await actions.createSkill({
          name: item.name,
          kind: item.kind,
          ...(item.category ? { category: item.category } : {}),
          ...(item.metric ? { metric: { ...item.metric, best: 0, bestAt: Date.now() } } : {}),
          requires: (item.requires ?? [])
            .map((key) => idByKey.get(key))
            .filter((id): id is string => id !== undefined),
        });
        idByKey.set(item.key, created.id);
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Nothing here yet</h2>
      <p className="muted">
        Start from the road to an Ayesha — five steps in order, plus the conditioning that goes
        underneath. Names only: the checkpoints and the reference links are yours to write.
      </p>
      {failure && <p className="field-error">{failure}</p>}
      <div className="form__actions">
        <button type="button" onClick={seed} disabled={seeding}>
          {seeding ? 'Adding…' : 'Add the starting path'}
        </button>
      </div>
    </section>
  );
}
