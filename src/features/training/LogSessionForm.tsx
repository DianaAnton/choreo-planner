import { type FormEvent, useState } from 'react';

import {
  FELT_LABELS,
  activeQuests,
  practiceMenu,
  todayKey,
  validateSession,
  type Skill,
  type TrainingFieldError,
} from '../../domain/training';
import type { Id } from '../../domain/types';
import { useTraining } from './useTraining';

const QUICK_DURATIONS = [30, 45, 60, 90];

interface Props {
  onSaved(): void;
  onCancel(): void;
}

/**
 * The screen with the tightest budget in the app: under ten seconds, standing,
 * one-handed, probably sweating. Everything has a default that is usually
 * right, so the minimum interaction is tap a chip, tap Save.
 *
 * A per-skill number only appears for skills that have a unit configured —
 * without one the number cannot become a best (see `improvedMetric`), and an
 * input that silently discards what you type is worse than no input.
 */
export function LogSessionForm({ onSaved, onCancel }: Props) {
  const { skills, actions } = useTraining();

  const [date, setDate] = useState(todayKey());
  const [durationMin, setDurationMin] = useState(60);
  const [felt, setFelt] = useState<1 | 2 | 3>(2);
  const [selected, setSelected] = useState<Id[]>([]);
  const [marks, setMarks] = useState<Record<Id, string>>({});
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<TrainingFieldError[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Active quests first: they are what you meant to train. Practice follows,
  // stalest first, which is the same order as the Today screen's menu.
  const offered: Skill[] = [...activeQuests(skills), ...practiceMenu(skills)];
  const rest = skills.filter((skill) => !offered.some((shown) => shown.id === skill.id));

  const errorFor = (field: TrainingFieldError['field']) =>
    errors.find((error) => error.field === field)?.message;

  function toggle(id: Id) {
    setSelected((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);

    const numericMarks: Record<Id, number> = {};
    for (const [id, raw] of Object.entries(marks)) {
      if (selected.includes(id) && raw.trim() !== '') numericMarks[id] = Number.parseFloat(raw);
    }

    const input = {
      date,
      durationMin,
      felt,
      skillIds: selected,
      ...(Object.keys(numericMarks).length > 0 ? { marks: numericMarks } : {}),
      ...(note.trim() ? { note } : {}),
    };

    const found = validateSession(input);
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      await actions.logSession(input);
      onSaved();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  }

  return (
    <form className="stack form" onSubmit={handleSubmit} noValidate>
      <h2>Log a session</h2>

      <fieldset className="fieldset">
        <legend>How long</legend>
        <div className="chip-row">
          {QUICK_DURATIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`chip chip--button${durationMin === minutes ? ' chip--on' : ''}`}
              aria-pressed={durationMin === minutes}
              onClick={() => setDurationMin(minutes)}
            >
              {minutes}m
            </button>
          ))}
          <input
            className="chip-row__number"
            type="number"
            inputMode="numeric"
            aria-label="Minutes"
            value={durationMin}
            onChange={(event) => setDurationMin(Number.parseInt(event.target.value, 10))}
          />
        </div>
        {errorFor('duration') && <p className="field-error">{errorFor('duration')}</p>}
      </fieldset>

      <fieldset className="fieldset">
        <legend>How it felt</legend>
        <div className="chip-row">
          {([1, 2, 3] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`chip chip--button${felt === value ? ' chip--on' : ''}`}
              aria-pressed={felt === value}
              onClick={() => setFelt(value)}
            >
              {FELT_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>What you touched</legend>
        {skills.length === 0 ? (
          <p className="hint">No skills yet — a session with none still counts.</p>
        ) : (
          <div className="chip-row">
            {[...offered, ...rest].map((skill) => (
              <button
                key={skill.id}
                type="button"
                className={`chip chip--button${selected.includes(skill.id) ? ' chip--on' : ''}`}
                aria-pressed={selected.includes(skill.id)}
                onClick={() => toggle(skill.id)}
              >
                {skill.name}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      {selected
        .map((id) => skills.find((skill) => skill.id === id))
        .filter((skill): skill is Skill => skill?.metric !== undefined)
        .map((skill) => (
          <div key={skill.id} className="log__mark">
            <label htmlFor={`mark-${skill.id}`}>
              {skill.name} — best {skill.metric?.best} {skill.metric?.unit}
            </label>
            <input
              id={`mark-${skill.id}`}
              type="number"
              inputMode="decimal"
              placeholder={`today's ${skill.metric?.unit}`}
              value={marks[skill.id] ?? ''}
              onChange={(event) =>
                setMarks((current) => ({ ...current, [skill.id]: event.target.value }))
              }
            />
          </div>
        ))}
      {errorFor('metric') && <p className="field-error">{errorFor('metric')}</p>}

      <label htmlFor="session-note">One line, if there is one</label>
      <input
        id="session-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="left side still collapses"
      />
      {errorFor('note') && <p className="field-error">{errorFor('note')}</p>}

      <label htmlFor="session-date">Date</label>
      <input
        id="session-date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      {errorFor('date') && <p className="field-error">{errorFor('date')}</p>}

      {failure && <p className="field-error">{failure}</p>}

      <div className="form__actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
