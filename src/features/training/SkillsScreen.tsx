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

/**
 * One list, grouped by what the move *is* rather than split into Quests and
 * Practice — two sections of near-identical rows made the screen look twice as
 * long as it was and said nothing the rows did not already say. Kind is a
 * marker on the row now.
 *
 * Active quests come first regardless of category: they are the answer to "what
 * am I doing", and burying them under C-for-climb was silly.
 */
function SkillList({ skills }: { skills: Skill[] }) {
  const active = skills.filter((skill) => skill.isActive);
  const rest = skills.filter((skill) => !skill.isActive);

  const groups = new Map<string, Skill[]>();
  for (const skill of rest) {
    const key = skill.category ?? 'other';
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }

  const ordered = [...groups.entries()].sort(([a], [b]) => {
    // Conditioning and flexibility last: they are the things you do around the
    // thing you came to do.
    const rank = (key: string) => (key === 'conditioning' ? 1 : key === 'flexibility' ? 2 : 0);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  return (
    <div className="stack">
      {active.length > 0 && (
        <section className="stack">
          <h2>Working on</h2>
          <ul className="stack">
            {active.map((skill) => (
              <SkillRow key={skill.id} skill={skill} />
            ))}
          </ul>
        </section>
      )}

      {ordered.map(([category, members]) => (
        <section key={category} className="stack">
          <h2>{label(category)}</h2>
          <ul className="stack">
            {[...members]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((skill) => (
                <SkillRow key={skill.id} skill={skill} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function label(category: string): string {
  const known: Record<string, string> = {
    invert: 'Inverts and holds',
    spin: 'Spins',
    climb: 'Climbs',
    conditioning: 'Conditioning',
    flexibility: 'Flexibility',
    other: 'Everything else',
  };
  return known[category] ?? category[0]?.toUpperCase() + category.slice(1);
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
          {skill.kind === 'practice' && <span className="badge badge--quiet">practice</span>}
        </span>
        {skill.kind === 'quest' ? (
          <LadderMeter state={ladderOf(skill)} />
        ) : (
          skill.metric && (
            <span className="muted small">
              best {skill.metric.best} {skill.metric.unit}
            </span>
          )
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
