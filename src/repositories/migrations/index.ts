/**
 * Migrations between `schemaVersion` values. Adding one is required whenever a
 * persisted shape changes — see docs/decisions/0008-single-document-project.md.
 *
 * Nothing to migrate yet at v1; the seam exists so the first real change has an
 * obvious home instead of becoming a scattering of optional-field checks.
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

  // Older versions would be upgraded here, oldest first.
  return raw;
}
