import { type ClipboardEvent, useEffect, useRef, useState } from 'react';

import type { SkillImage, Skill } from '../../domain/training';
import { imageFromClipboard, toStorableImage } from '../../lib/images';
import { useTraining } from './useTraining';

/**
 * One picture per skill, for recognising the shape at a glance.
 *
 * Loaded here and nowhere else: the skills subscription runs on every training
 * screen, and thirty images riding along with it would be megabytes on mobile
 * data before anything rendered.
 *
 * Downscaled on the device before it is ever sent — see `toStorableImage`.
 */
export function SkillImagePanel({ skill }: { skill: Skill }) {
  const { repository } = useTraining();
  const [image, setImage] = useState<SkillImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    return repository.subscribeSkillImage(
      skill.id,
      (next) => {
        setImage(next);
        setLoading(false);
      },
      (error) => {
        setFailure(error.message);
        setLoading(false);
      },
    );
  }, [repository, skill.id]);

  async function store(blob: Blob) {
    setBusy(true);
    setFailure(null);
    try {
      await repository.setSkillImage(skill.id, await toStorableImage(blob));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function onPaste(event: ClipboardEvent) {
    const pasted = imageFromClipboard(event.clipboardData);
    if (!pasted) return;
    event.preventDefault();
    void store(pasted);
  }

  return (
    <section className="stack" onPaste={onPaste}>
      <h2>Picture</h2>

      {loading ? (
        <p className="muted small">Loading…</p>
      ) : image ? (
        <img className="skill-image" src={image.dataUrl} alt={skill.name} />
      ) : (
        <p className="empty small">No picture yet.</p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void store(file);
          // Reset, or picking the same file twice fires no change event.
          event.target.value = '';
        }}
      />

      <div className="chip-row">
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          {busy ? 'Saving…' : image ? 'Replace' : 'Add a picture'}
        </button>
        {image && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void repository.removeSkillImage(skill.id)}
          >
            Remove
          </button>
        )}
      </div>

      {failure && <p className="field-error">{failure}</p>}
    </section>
  );
}
