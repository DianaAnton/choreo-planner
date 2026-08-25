import { Link } from 'react-router';

import {
  checkpointProgress,
  daysSinceUsed,
  isStale,
  ladderOf,
  nextCheckpoint,
  type Skill,
} from '../../domain/training';
import type { Id } from '../../domain/types';
import { LadderMeter } from './LadderMeter';
import { useTraining } from './useTraining';

/**
 * The screen you open standing next to the pole, or at the park.
 *
 * **One list, not three.** It used to split into "Working on", "Gone rusty" and
 * "Ten minutes spare" — quests over here, practice over there — which is the
 * app's internal taxonomy leaking onto the surface. Standing there with ten
 * minutes free you do not want to be told which of three boxes your options are
 * filed in; you want one ordered list and a reason next to each row.
 *
 * The order *is* the priority: active quests, then what has gone rusty, then
 * whatever has been untouched longest. Why a row is there is a word on the row.
 *
 * Deliberately no charts, no streak, no total hours — see the risk noted
 * against Phase 2.5 in docs/plan.md.
 */
export function TodayScreen() {
  const { skills, quests, practice, stale, inbox, daysTrainedThisWeek, weeklyTarget, loading, error } =
    useTraining();

  const now = Date.now();
  const rusty = stale.filter((skill) => !quests.some((quest) => quest.id === skill.id));

  const seen = new Set<Id>();
  const rows: { skill: Skill; reason: Reason }[] = [];
  const push = (skill: Skill, reason: Reason) => {
    if (seen.has(skill.id)) return;
    seen.add(skill.id);
    rows.push({ skill, reason });
  };

  for (const quest of quests) push(quest, 'active');
  for (const skill of rusty) push(skill, 'rusty');
  for (const skill of practice) push(skill, 'stale');

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
      ) : rows.length === 0 ? (
        <p className="empty">
          {skills.length === 0 ? (
            <>
              Nothing here yet. <Link to="/training/skills">Start from a map</Link>.
            </>
          ) : (
            <>
              Nothing needs you today. <Link to="/training/skills">Pick something</Link>.
            </>
          )}
        </p>
      ) : (
        <section className="stack">
          <div className="section-head">
            <h2>Today</h2>
            <Link to="/training/skills" className="small">
              All skills
            </Link>
          </div>

          <ul className="quest-list">
            {rows.map(({ skill, reason }) => (
              <TodayRow key={skill.id} skill={skill} reason={reason} now={now} />
            ))}
          </ul>
        </section>
      )}

      {inbox.length > 0 && (
        <p className="notice">
          <Link to="/training/inbox">
            {inbox.length} saved {inbox.length === 1 ? 'link' : 'links'} to sort out
          </Link>
        </p>
      )}
    </div>
  );
}

type Reason = 'active' | 'rusty' | 'stale';

function TodayRow({ skill, reason, now }: { skill: Skill; reason: Reason; now: number }) {
  const next = nextCheckpoint(skill);
  const { done, total } = checkpointProgress(skill);
  const isQuest = skill.kind === 'quest';

  return (
    <li className={`card quest quest--${reason}`}>
      <div className="quest__head">
        <Link to={`/training/skills/${skill.id}`} className="quest__title">
          {skill.name}
        </Link>
        <span className={`tag tag--${reason}`}>{reasonLabel(reason, skill, now)}</span>
      </div>

      {isQuest && <LadderMeter state={ladderOf(skill)} />}

      {/* Only active quests carry a next step; for everything else the row is
          the whole message and a second line would be padding. */}
      {reason === 'active' && (
        <>
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
            {done}/{total} checkpoints · {lastTouched(skill, now)}
          </p>
        </>
      )}

      {reason !== 'active' && (
        <p className="muted small">
          {skill.metric ? `best ${skill.metric.best} ${skill.metric.unit} · ` : ''}
          {lastTouched(skill, now)}
        </p>
      )}
    </li>
  );
}

function reasonLabel(reason: Reason, skill: Skill, now: number): string {
  if (reason === 'active') return 'working on';
  if (reason === 'rusty') return 'rusty';
  return isStale(skill, now) ? 'rusty' : 'ten minutes';
}

/** Coarse on purpose — "3 minutes ago" is noise when the unit of work is a day. */
function lastTouched(skill: Skill, now: number = Date.now()): string {
  const days = daysSinceUsed(skill, now);
  if (days === null) return 'never trained';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
