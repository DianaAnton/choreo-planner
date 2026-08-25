import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';

import { describeCleanRep, ladderDescriptionsFor } from '../../domain/discipline';
import {
  FELT_LABELS,
  isPractice,
  isQuest,
  ladderOf,
  normalizeUrl,
  sessionsForSkill,
  unmetPrerequisites,
  type Skill,
} from '../../domain/training';
import { LadderMeter } from './LadderMeter';
import { SkillImagePanel } from './SkillImagePanel';
import { useTraining } from './useTraining';

interface Props {
  skill: Skill;
}

/**
 * Everything about one skill on one screen, because on a phone a second screen
 * is a second thing you will not open. Order follows what you actually want
 * mid-session: where am I, what is next, then the reference material.
 */
export function SkillDetail({ skill }: Props) {
  const { byId, sessions, actions, profile } = useTraining();
  const ladderDescriptions = ladderDescriptionsFor(profile);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const blocked = unmetPrerequisites(skill, byId);
  const history = sessionsForSkill(sessions, skill.id).slice(0, 8);

  async function handleActivate() {
    const result = await actions.activate(skill);
    setRefusal(result.ok ? null : result.message);
  }

  return (
    <div className="stack">
      <header className="stack">
        <h1>{skill.name}</h1>
      </header>

      <section className="stack">
        <h2>Where it is</h2>
        <LadderMeter
          state={ladderOf(skill)}
          onChange={(next) => actions.setLadder(skill, next)}
        />
        <p className="hint">
          {ladderDescriptions[ladderOf(skill)]}
          {ladderOf(skill) === 'cleanRep' && ` ${describeCleanRep(profile.cleanRepTest)}`}
        </p>
      </section>

      {isQuest(skill) && (
        <section className="stack">
          {skill.isActive ? (
            <button type="button" className="ghost" onClick={() => actions.deactivate(skill)}>
              Park this quest
            </button>
          ) : (
            <button type="button" className="primary" onClick={handleActivate}>
              Make this active
            </button>
          )}
          {refusal && (
            <p className="notice notice--error" role="alert">
              {refusal}
            </p>
          )}
        </section>
      )}

      {blocked.length > 0 && (
        <section className="stack">
          <h2>Not there yet</h2>
          <ul className="chip-list">
            {blocked.map((required) => (
              <li key={required.id}>
                <Link to={`/training/skills/${required.id}`} className="chip chip--warn">
                  {required.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Checkpoints skill={skill} />

      {(isPractice(skill) || skill.metric) && <Metric skill={skill} />}

      <SkillImagePanel skill={skill} />

      <Refs skill={skill} />

      <section className="stack">
        <h2>Recent sessions</h2>
        {history.length === 0 ? (
          <p className="empty">Nothing logged against this yet.</p>
        ) : (
          <ul className="history">
            {history.map((session) => (
              <li key={session.id}>
                <span>{session.date}</span>
                <span className="muted small">
                  {session.durationMin}m · {FELT_LABELS[session.felt]}
                  {session.marks?.[skill.id] !== undefined &&
                    ` · ${session.marks[skill.id]}${skill.metric ? ` ${skill.metric.unit}` : ''}`}
                </span>
                {session.note && <span className="muted small">{session.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        {confirmingDelete ? (
          <div className="form__actions">
            <span className="small">
              Delete {skill.name}? Its history stays in the sessions that name it.
            </span>
            <button
              type="button"
              className="danger"
              onClick={() => actions.removeSkill(skill.id)}
            >
              Delete
            </button>
            <button type="button" className="ghost" onClick={() => setConfirmingDelete(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button type="button" className="ghost" onClick={() => setConfirmingDelete(true)}>
            Delete this skill
          </button>
        )}
      </section>
    </div>
  );
}

function Checkpoints({ skill }: Props) {
  const { actions } = useTraining();
  const [text, setText] = useState('');

  async function add(event: FormEvent) {
    event.preventDefault();
    if (text.trim().length === 0) return;
    await actions.addCheckpoint(skill, text);
    setText('');
  }

  return (
    <section className="stack">
      <h2>Checkpoints</h2>

      {skill.checkpoints.length > 0 && (
        <ul className="checkpoints">
          {skill.checkpoints.map((checkpoint) => (
            <li key={checkpoint.id}>
              <label className="checkpoint">
                <input
                  type="checkbox"
                  checked={checkpoint.doneAt !== null}
                  onChange={() => actions.toggleCheckpoint(skill, checkpoint.id)}
                />
                <span className={checkpoint.doneAt !== null ? 'checkpoint--done' : ''}>
                  {checkpoint.text}
                </span>
              </label>
              <button
                type="button"
                className="ghost small"
                aria-label={`Remove checkpoint ${checkpoint.text}`}
                onClick={() => actions.removeCheckpoint(skill, checkpoint.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="inline-form" onSubmit={add}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="hold straight-arm handspring 5s"
          aria-label="New checkpoint"
        />
        <button type="submit">Add</button>
      </form>
    </section>
  );
}

function Metric({ skill }: Props) {
  const { actions } = useTraining();
  const [unit, setUnit] = useState<'seconds' | 'reps'>(skill.metric?.unit ?? 'seconds');

  if (skill.metric) {
    return (
      <section className="stack">
        <h2>Best so far</h2>
        <p className="stat-line">
          <strong>
            {skill.metric.best} {skill.metric.unit}
          </strong>
          <span className="muted small">
            {' '}
            on {new Date(skill.metric.bestAt).toLocaleDateString()}
          </span>
        </p>
      </section>
    );
  }

  return (
    <section className="stack">
      <h2>Track a number</h2>
      <div className="chip-row">
        {(['seconds', 'reps'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`chip chip--button${unit === option ? ' chip--on' : ''}`}
            aria-pressed={unit === option}
            onClick={() => setUnit(option)}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          onClick={() => actions.setMetric(skill, { unit, best: 0, bestAt: Date.now() })}
        >
          Start tracking
        </button>
      </div>
    </section>
  );
}

function Refs({ skill }: Props) {
  const { actions } = useTraining();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();

    const normalized = normalizeUrl(url);
    if (!normalized) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    await actions.addRef(skill, normalized, note.trim() || undefined);
    setUrl('');
    setNote('');
  }

  return (
    <section className="stack">
      <h2>References</h2>

      {skill.refs.length > 0 && (
        <ul className="stack">
          {skill.refs.map((ref, index) => (
            <li key={`${ref.url}-${index}`} className="ref">
              <a href={ref.url} target="_blank" rel="noreferrer noopener">
                {ref.url}
              </a>
              {ref.note && <span className="muted small">{ref.note}</span>}
              <button
                type="button"
                className="ghost small"
                aria-label={`Remove reference ${ref.url}`}
                onClick={() => actions.removeRef(skill, index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="inline-form" onSubmit={add}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          inputMode="url"
          aria-label="Reference link"
          aria-invalid={invalid}
        />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="what to watch for"
          aria-label="Reference note"
        />
        <button type="submit">Add</button>
      </form>
      {invalid && <p className="field-error">Needs to be an http or https link.</p>}
    </section>
  );
}
