/**
 * Migrations between `schemaVersion` values. Adding one is required whenever a
 * persisted shape changes — see docs/decisions/0008-single-document-project.md.
 *
 * v1 → v2 (ADR 0011) is the first one, and it converts nothing: the preset
 * library became the skill library and `ShapeEntrySource.preset` became
 * `skill`, but Phase 6 has not shipped, so every stored `shapes[]` is empty and
 * no document can contain a `preset` source. What the bump buys is the refusal
 * in the other direction — an old build declining to open a newer choreo.
 */

import { SCHEMA_VERSION, type Project } from '../../domain/types';

export class UnsupportedSchemaError extends Error {
  constructor(readonly found: number) {
    super(
      `Project uses schema version ${found}, but this build understands ${SCHEMA_VERSION}. ` +
        'Update the app to open it.',
    );
    this.name = 'UnsupportedSchemaError';
  }
}

/**
 * Brings a stored document up to the current schema.
 *
 * A *newer* version than this build understands is refused rather than
 * best-guessed: a phone running last week's cached service worker must not
 * silently strip fields a laptop just wrote.
 */
export function migrateProject(raw: Project): Project {
  if (raw.schemaVersion > SCHEMA_VERSION) {
    throw new UnsupportedSchemaError(raw.schemaVersion);
  }

  // Older versions are upgraded here, oldest first.
  if (raw.schemaVersion < SCHEMA_VERSION) {
    // v1 → v2: a version stamp, nothing more. See the note above.
    return { ...raw, schemaVersion: SCHEMA_VERSION };
  }

  return raw;
}
