import { type FormEvent, useState } from 'react';

import {
  validateInboxItem,
  validateNewSkill,
  type InboxItem,
  type TrainingFieldError,
} from '../../domain/training';
import { useTraining } from './useTraining';

/**
 * The answer to "a reel seen on Tuesday is gone by Saturday". Capture is one
 * field and one button; deciding what it *is* happens later, which is the only
 * way capture stays fast enough to actually happen.
 */
export function InboxScreen() {
  const { inbox, actions } = useTraining();

  return (
    <div className="stack">
      <CaptureForm />

      {inbox.length === 0 ? (
        <p className="empty">
          Nothing saved yet.
        </p>
      ) : (
        <ul className="stack">
          {inbox.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              onDiscard={() => actions.discardInboxItem(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CaptureForm() {
  const { actions } = useTraining();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<TrainingFieldError[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const found = validateInboxItem({ url, note });
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      await actions.addInboxItem({ url, ...(note.trim() ? { note: note.trim() } : {}) });
      setUrl('');
      setNote('');
    } finally {
      setSaving(false);
    }
  }

  const errorFor = (field: TrainingFieldError['field']) =>
    errors.find((error) => error.field === field)?.message;

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="inbox-url">Link</label>
      <input
        id="inbox-url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="paste it here"
        inputMode="url"
        aria-invalid={Boolean(errorFor('url'))}
      />
      {errorFor('url') && <p className="field-error">{errorFor('url')}</p>}

      <label htmlFor="inbox-note">What to watch for</label>
      <input
        id="inbox-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="the transition at 0:14"
      />
      {errorFor('note') && <p className="field-error">{errorFor('note')}</p>}

      <div className="form__actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save it'}
        </button>
      </div>
    </form>
  );
}

function InboxRow({ item, onDiscard }: { item: InboxItem; onDiscard(): Promise<void> }) {
  const [promoting, setPromoting] = useState(false);

  return (
    <li className="card stack">
      <a href={item.url} target="_blank" rel="noreferrer noopener" className="inbox__url">
        {item.url}
      </a>
      {item.note && <p className="muted">{item.note}</p>}

      {promoting ? (
        <PromoteForm item={item} onDone={() => setPromoting(false)} />
      ) : (
        <div className="form__actions">
          <button type="button" onClick={() => setPromoting(true)}>
            Make it a skill
          </button>
          <button type="button" className="ghost" onClick={onDiscard}>
            Discard
          </button>
        </div>
      )}
    </li>
  );
}

function PromoteForm({ item, onDone }: { item: InboxItem; onDone(): void }) {
  const { actions } = useTraining();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<TrainingFieldError[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setRefusal(null);

    const found = validateNewSkill({ name });
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      // The cap is checked in the domain, not here — this screen only renders
      // the refusal it is handed.
      // No kind question: a promoted item has no checkpoints yet, so it is
      // practice until one is written (ADR 0014).
      const result = await actions.promoteInboxItem(item, { name });
      if (!result.ok) {
        setRefusal(result.message);
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack form" onSubmit={handleSubmit} noValidate>
      <label htmlFor={`promote-${item.id}`}>Call it</label>
      <input
        id={`promote-${item.id}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Shoulder mount"
        autoFocus
        aria-invalid={errors.length > 0}
      />
      {errors[0] && <p className="field-error">{errors[0].message}</p>}

      {refusal && (
        <p className="notice notice--error" role="alert">
          {refusal}
        </p>
      )}

      <div className="form__actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
