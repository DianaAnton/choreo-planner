import { ladderDescriptionsFor, ladderLabelsFor } from '../../domain/discipline';
import { LADDER, ladderIndex, type LadderState } from '../../domain/training';
import { useTraining } from './useTraining';

interface Props {
  state: LadderState;
  /** Omit to render a read-only meter — the Today screen never edits. */
  onChange?: (next: LadderState) => void;
}

/**
 * Six segments, filled up to where you are. The point of the ladder is that
 * "not yet" is a position rather than a failure, so every rung is always
 * visible — including the ones ahead.
 */
export function LadderMeter({ state, onChange }: Props) {
  // Wording is per discipline: a skater's terminal rung is "in a line", not
  // "in a choreo". The ordinal is the same, which is the point.
  const { profile } = useTraining();
  const LADDER_LABELS = ladderLabelsFor(profile);
  const LADDER_DESCRIPTIONS = ladderDescriptionsFor(profile);
  const current = ladderIndex(state);

  if (!onChange) {
    return (
      <div
        className="ladder ladder--static"
        role="img"
        aria-label={`Ladder: ${LADDER_LABELS[state]}`}
      >
        {LADDER.map((rung, index) => (
          <span
            key={rung}
            className={`ladder__rung${index <= current ? ' ladder__rung--filled' : ''}`}
          />
        ))}
        <span className="ladder__caption small">{LADDER_LABELS[state]}</span>
      </div>
    );
  }

  return (
    <div className="ladder" role="radiogroup" aria-label="Ladder state">
      {LADDER.map((rung, index) => (
        <button
          key={rung}
          type="button"
          role="radio"
          aria-checked={rung === state}
          title={LADDER_DESCRIPTIONS[rung]}
          className={`ladder__step${index <= current ? ' ladder__step--filled' : ''}${
            rung === state ? ' ladder__step--current' : ''
          }`}
          onClick={() => onChange(rung)}
        >
          {LADDER_LABELS[rung]}
        </button>
      ))}
    </div>
  );
}
