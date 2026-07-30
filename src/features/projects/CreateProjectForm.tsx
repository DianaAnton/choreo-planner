import { type FormEvent, useState } from 'react';

import { DEFAULT_BPM, type FieldError, validateNewProject } from '../../domain/project';
import type { NewProject } from '../../repositories/types';

interface Props {
  discipline: string;
  onCreate(input: NewProject): Promise<void>;
  onCancel(): void;
}

export function CreateProjectForm({ discipline, onCreate, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  // Kept as a string: an <input type="number"> can hold "" or "12e", neither of
  // which is a number, and coercing early hides that from validation.
  const [bpmText, setBpmText] = useState(String(DEFAULT_BPM));
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errorFor = (field: FieldError['field']) => errors.find((e) => e.field === field)?.message;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);

    const bpm = Number.parseFloat(bpmText);
    const found = validateNewProject({ title, artist, bpm });
    setErrors(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      const trimmedArtist = artist.trim();
      await onCreate({
        title,
        discipline,
        bpm,
        ...(trimmedArtist ? { artist: trimmedArtist } : {}),
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h2>New choreo</h2>

      <label htmlFor="title">Song</label>
      <input
        id="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Code Mistake"
        autoFocus
        aria-invalid={Boolean(errorFor('title'))}
      />
      {errorFor('title') && <p className="field-error">{errorFor('title')}</p>}

      <label htmlFor="artist">Artist (optional)</label>
      <input
        id="artist"
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        placeholder="CORPSE x Bring Me the Horizon"
      />

      <label htmlFor="bpm">BPM</label>
      <input
        id="bpm"
        type="number"
        inputMode="decimal"
        value={bpmText}
        onChange={(e) => setBpmText(e.target.value)}
        aria-invalid={Boolean(errorFor('bpm'))}
      />
      {errorFor('bpm') && <p className="field-error">{errorFor('bpm')}</p>}
      <p className="hint">You can tap the tempo out later — this is just a starting point.</p>

      {failure && <p className="field-error">{failure}</p>}

      <div className="form__actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
