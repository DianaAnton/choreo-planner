import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  PLAN_LENGTHS,
  hasSkillWork,
  plannedMinutes,
  trainedIn,
  type PlanBlock,
} from '../../domain/sessionPlan';
import { isQuest, ladderOf, nextCheckpoint, type Skill } from '../../domain/training';
import { LadderMeter } from './LadderMeter';
import { useTraining } from './useTraining';

/**
 * The written plan: how long you have, and what to do with it, in order.
 *
 * The two things it refuses to do are the point. It will not tell you to train
 * the goal when something underneath it is not clean — an Ayesha on a shaky
 * invert resolves to the invert, and the row says which goals are waiting on
 * it. And it will not list your warm-up back at you: that is a tick, because
 * you already know what to do.
 *
 * One tick per block rather than per skill. Standing there mid-session you want
 * to mark a chunk done, not audit it; the Log screen is where you correct the
 * details, and it opens already filled in with whatever you ticked.
 */
export function SessionPlanScreen() {
  const { plan, loading, error } = useTraining();

  if (error) {
    return (
      <p className="notice notice--error" role="alert">
        Could not load your training: {error.message}
      </p>
    );
  }

  if (loading) {
    return (
      <p className="muted" aria-busy="true">
        Loading…
      </p>
    );
  }

  return plan.current ? <PlanInProgress /> : <PlanSetup />;
}

// --- Before there is a plan ------------------------------------------------

function PlanSetup() {
  const { plan, quests, skills } = useTraining();
  const [minutes, setMinutes] = useState<number>(50);

  return (
    <div className="stack">
      <section className="stack">
        <h2>How long have you got?</h2>
        <div className="chip-row">
          {PLAN_LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              className={`chip chip--button${minutes === length ? ' chip--on' : ''}`}
              aria-pressed={minutes === length}
              onClick={() => setMinutes(length)}
            >
              {length}m
            </button>
          ))}
          <input
            className="chip-row__number"
            type="number"
            inputMode="numeric"
            aria-label="Minutes"
            value={minutes}
            onChange={(event) => setMinutes(Number.parseInt(event.target.value, 10))}
          />
        </div>
      </section>

      {/* The cap decides what you are working on, not the planner. With nothing
          active there is no goal work to plan, so say so here rather than
          quietly handing those minutes to the spins. */}
      {skills.length === 0 ? (
        <p className="empty">
          Nothing to plan yet. <Link to="/training/skills">Start from a map</Link>.
        </p>
      ) : (
        quests.length === 0 && (
          <p className="notice">
            Nothing is active, so the plan has no goal work in it.{' '}
            <Link to="/training/skills">Pick what you are working towards</Link> — up to three.
          </p>
        )
      )}

      <button
        type="button"
        className="primary"
        disabled={!Number.isFinite(minutes) || minutes <= 0}
        onClick={() => plan.start(minutes)}
      >
        Build the plan
      </button>
    </div>
  );
}

// --- The plan itself -------------------------------------------------------

function PlanInProgress() {
  const { plan } = useTraining();
  const navigate = useNavigate();

  const current = plan.current;
  if (!current) return null;

  const done = trainedIn(current, plan.ticked);
  const total = plannedMinutes(current);

  return (
    <div className="stack">
      <section className="week">
        <p className="week__count">
          <strong>{done.minutes}</strong>
          <span className="muted"> of {total} minutes done</span>
        </p>
        <button type="button" className="ghost small" onClick={plan.discard}>
          Start over
        </button>
      </section>

      {!hasSkillWork(current) && (
        <p className="notice">
          There was nothing to fill the middle with.{' '}
          <Link to="/training/skills">Add some skills</Link> and build it again.
        </p>
      )}

      <ol className="plan">
        {current.blocks.map((block) => (
          <PlanBlockRow key={block.id} block={block} />
        ))}
      </ol>

      <div className="form__actions">
        <button
          type="button"
          className="primary"
          disabled={plan.ticked.size === 0}
          onClick={() =>
            void navigate('/training/log', {
              state: { skillIds: done.skillIds, durationMin: done.minutes },
            })
          }
        >
          {plan.ticked.size === 0 ? 'Tick what you did' : `Log ${done.minutes} minutes`}
        </button>
      </div>

      <p className="hint">
        {/* Said once, here, rather than as a warning on every tick. */}
        The plan lives until you log it or reload the page. Nothing is saved
        until you log the session.
      </p>

      {/* The goals the plan is serving, so the point of the middle block is
          visible without opening anything. */}
      <PlanGoals blocks={current.blocks} />
    </div>
  );
}

function PlanBlockRow({ block }: { block: PlanBlock }) {
  const { plan, byId } = useTraining();
  const ticked = plan.ticked.has(block.id);

  const skills = block.skillIds
    .map((id) => byId.get(id))
    .filter((skill): skill is Skill => skill !== undefined);

  const towards = block.towardsIds
    .map((id) => byId.get(id)?.name)
    .filter((name): name is string => name !== undefined);

  return (
    <li className={`card plan__block${ticked ? ' plan__block--done' : ''}`}>
      <label className="checkpoint plan__head">
        <input type="checkbox" checked={ticked} onChange={() => plan.toggle(block.id)} />
        <span className={`plan__title${ticked ? ' checkpoint--done' : ''}`}>{block.title}</span>
        <span className="plan__minutes">{block.minutes} min</span>
      </label>

      {towards.length > 0 && (
        <p className="plan__towards">On the way to {joinNames(towards)}.</p>
      )}

      {skills.length > 0 && (
        <ul className="plan__skills">
          {skills.map((skill) => (
            <li key={skill.id}>
              <Link to={`/training/skills/${skill.id}`} className="plan__skill">
                {skill.name}
              </Link>
              {isQuest(skill) && <LadderMeter state={ladderOf(skill)} />}
              <p className="muted small">{cueFor(skill)}</p>
            </li>
          ))}
        </ul>
      )}

      {block.note && <p className="hint plan__note">{block.note}</p>}
    </li>
  );
}

function PlanGoals({ blocks }: { blocks: readonly PlanBlock[] }) {
  const { byId } = useTraining();
  const goalIds = [...new Set(blocks.flatMap((block) => block.towardsIds))].filter((id) =>
    byId.has(id),
  );
  if (goalIds.length === 0) return null;

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Working towards</h2>
        <Link to="/training/skills" className="small">
          The map
        </Link>
      </div>
      <ul className="chip-list">
        {goalIds.map((id) => (
          <li key={id}>
            <Link to={`/training/skills/${id}`} className="chip">
              {byId.get(id)?.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The one thing to do in this skill. A quest's next open checkpoint, because
 * that is already the app's answer to "what would count as progress"; a
 * practice skill's best, because there is nothing to tick and the number is
 * the whole point.
 */
function cueFor(skill: Skill): string {
  const next = nextCheckpoint(skill);
  if (next) return next.text;
  if (skill.metric) return `best ${skill.metric.best} ${skill.metric.unit} — beat it`;
  if (isQuest(skill)) return 'Every checkpoint ticked — have you filmed it?';
  return 'Your call.';
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
