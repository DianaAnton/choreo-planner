import { useState } from 'react';

import type { DisciplineProfile } from '../../domain/discipline';
import { useTraining } from './useTraining';

interface Props {
  /** Every registered profile, injected from the composition root. */
  available: readonly DisciplineProfile[];
}

/**
 * Switching sport. Nothing is shared between disciplines except the session
 * log — a training day is a training day — so this is just a filter on which
 * skills you are looking at, and switching back finds everything where it was.
 *
 * Hidden entirely when there is only one to pick.
 */
export function DisciplineSwitch({ available }: Props) {
  const { profile, actions } = useTraining();
  const [busy, setBusy] = useState(false);

  if (available.length < 2) return null;

  return (
    <div className="chip-row" role="group" aria-label="Discipline">
      {available.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`chip chip--button${option.id === profile.id ? ' chip--on' : ''}`}
          aria-pressed={option.id === profile.id}
          disabled={busy || option.id === profile.id}
          onClick={async () => {
            setBusy(true);
            try {
              await actions.setActiveDiscipline(option.id);
            } finally {
              setBusy(false);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
