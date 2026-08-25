import { Link } from 'react-router';

import {
  checkpointProgress,
  daysSinceUsed,
  ladderOf,
  nextCheckpoint,
  type Skill,
} from '../../domain/training';
import { LadderMeter } from './LadderMeter';
import { useTraining } from './useTraining';

/**
 * The screen you open standing next to the pole. Three questions, in the order
 * they get asked: what am I working on, what has gone rusty, and what can I do
 * with ten minutes.
 *
 * Deliberately no charts, no streak, no total hours — see the risk noted
 * against Phase 2.5 in docs/plan.md.
 */
export function TodayScreen() {
  const { quests, practice, stale, inbox, daysTrainedThisWeek, weeklyTarget, loading, error } =
    useTraining();

  const rusty = stale.filter((skill) => skill.kind === 'quest');

  return (
    <div className="stack">
      <section className="week">
        <p className="week__count">
          <strong>{daysTrainedThisWeek}</strong>
          <span className="muted"> of {weeklyTarget} days this week</span>
        </p>
        <Link className="button-link primary" to="/training/log">
          Log a session
        </Link>
      </section>

      {error && (
        <p className="notice notice--error" role="alert">
          Could not load your training: {error.message}
        </p>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section className="stack">
            <div className="section-head">
              <h2>Working on</h2>
              <Link to="/training/skills" className="small">
                All skills
              </Link>
            </div>

            {quests.length === 0 ? (
              <p className="empty">
                Nothing active. Pick one thing from{' '}
                <Link to="/training/skills">your skills</Link> and give it a checkpoint.
              </p>
            ) : (
              <ul className="quest-list">
                {quests.map((quest) => (
                  <QuestCard key={quest.id} skill={quest} />
                ))}
              </ul>
            )}
          </section>

          {rusty.length > 0 && (
            <section className="stack">
              <h2>Gone rusty</h2>
              <ul className="chip-list">
                {rusty.map((skill) => (
                  <li key={skill.id}>
                    <Link to={`/training/skills/${skill.id}`} className="chip chip--warn">
                      {skill.name}
                      <span className="chip__meta">{lastTouched(skill)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="stack">
            <h2>Ten minutes spare</h2>
            {practice.length === 0 ? (
              <p className="empty">
                Nothing to pick from yet.
              </p>
            ) : (
              <ul className="chip-list">
                {practice.map((skill) => (
                  <li key={skill.id}>
                    <Link to={`/training/skills/${skill.id}`} className="chip">
                      {skill.name}
                      <span className="chip__meta">{lastTouched(skill)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {inbox.length > 0 && (
            <p className="notice">
              <Link to="/training/inbox">
                {inbox.length} saved {inbox.length === 1 ? 'link' : 'links'} to sort out
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function QuestCard({ skill }: { skill: Skill }) {
  const next = nextCheckpoint(skill);
  const { done, total } = checkpointProgress(skill);

  return (
    <li className="card quest">
      <Link to={`/training/skills/${skill.id}`} className="quest__title">
        {skill.name}
      </Link>

      <LadderMeter state={ladderOf(skill)} />

      <p className="quest__next">
        {next ? (
          <>
            <span className="muted small">Next</span> {next.text}
          </>
        ) : (
          <span className="muted">Every checkpoint ticked — have you filmed it?</span>
        )}
      </p>

      <p className="muted small">
        {done}/{total} checkpoints · {lastTouched(skill)}
      </p>
    </li>
  );
}

/** Coarse on purpose — "3 minutes ago" is noise when the unit of work is a day. */
function lastTouched(skill: Skill): string {
  const days = daysSinceUsed(skill);
  if (days === null) return 'never trained';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
