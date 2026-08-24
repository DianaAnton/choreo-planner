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
import { STARTING_PATH, inPrerequisiteOrder } from '../../domain/trainingSeed';
import { LadderMeter } from './LadderMeter';
import { SkillMap } from './SkillMap';
import { useTraining } from './useTraining';

type View = 'map' | 'list';

/**
 * The map is the default (ADR 0012 §3). The list stays for adding a skill and
 * for conditioning, which has no prerequisites and so no place in a graph.
 */
export function SkillsScreen() {
  const { skills, questSlotsLeft } = useTraining();
  const [view, setView] = useState<View>('map');
  const [adding, setAdding] = useState(false);

  if (skills.length === 0) return <SeedPrompt />;

  return (
    <div className="stack">
      <div className="section-head">
        <div className="chip-row">
          {(['map', 'list'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`chip chip--button${view === option ? ' chip--on' : ''}`}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === 'map' ? 'Map' : 'List'}
            </button>
          ))}
        </div>
        <span className="muted small">{questSlotsLeft} of 3 slots free</span>
      </div>

      {view === 'map' ? <SkillMap /> : <SkillList skills={skills} />}

      {adding ? (
        <NewSkillForm onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="ghost" onClick={() => setAdding(true)}>
          Add a skill
        </button>
      )}
    </div>
  );
}

function SkillList({ skills }: { skills: Skill[] }) {
  const quests = skills.filter((skill) => skill.kind === 'quest').sort(activeFirst);
  const practice = skills.filter((skill) => skill.kind === 'practice');

  return (
    <div className="stack">
      {quests.length > 0 && (
        <section className="stack">
          <h2>Quests</h2>
          <ul className="stack">
            {quests.map((skill) => (
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
          {skill.kind === 'quest' && total > 0 && `${done}/${total} · `}
          {days === null ? 'never trained' : `${days}d since`}
        </span>
      </Link>
    </li>
  );
}

function NewSkillForm({ onDone }: { onDone(): void }) {
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
      // No cap check: a new skill is created parked. Activating it is the
      // decision the cap governs, and that goes through `canActivateQuest`.
      await actions.createSkill({ name, kind });
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
  const { actions } = useTraining();
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

  const goals = ['Ayesha', 'Shoulder mount', 'Handspring'];
  const quests = inPrerequisiteOrder(STARTING_PATH).filter((s) => s.kind === 'quest').length;

  return (
    <section className="card stack">
      <h2>Start from a map</h2>
      <p className="muted">
        {quests} moves along the road to {goals.slice(0, -1).join(', ')} and {goals.at(-1)}, plus
        the conditioning underneath — each with a checkpoint or two to argue with. All of it is
        yours to rename, re-order or delete.
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
