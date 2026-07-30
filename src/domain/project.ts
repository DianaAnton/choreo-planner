/**
 * Project creation and validation. Pure — no framework, no Firebase, so the
 * rules that decide what a valid project is stay testable in isolation.
 */

import { DEFAULT_BEATS_PER_BAR } from './time';
import { SCHEMA_VERSION, type Project } from './types';

/** The first project's tempo. A default, never a hardcoded assumption. */
export const DEFAULT_BPM = 143;

/**
 * Wide on purpose. 20 BPM is slower than any music worth choreographing to and
 * 400 is faster; the point is to catch a typo (a stray digit, an empty field),
 * not to police genre.
 */
export const MIN_BPM = 20;
export const MAX_BPM = 400;

export const MAX_TITLE_LENGTH = 120;

export interface NewProjectInput {
  title: string;
  artist?: string;
  discipline: string;
  bpm: number;
  ownerId: string;
}

export interface FieldError {
  field: 'title' | 'artist' | 'bpm';
  message: string;
}

export function validateNewProject(input: {
  title: string;
  artist?: string;
  bpm: number;
}): FieldError[] {
  const errors: FieldError[] = [];

  const title = input.title.trim();
  if (title.length === 0) {
    errors.push({ field: 'title', message: 'Give the choreo a name.' });
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.push({
      field: 'title',
      message: `Keep the name under ${MAX_TITLE_LENGTH} characters.`,
    });
  }

  if (!Number.isFinite(input.bpm)) {
    errors.push({ field: 'bpm', message: 'BPM must be a number.' });
  } else if (input.bpm < MIN_BPM || input.bpm > MAX_BPM) {
    errors.push({
      field: 'bpm',
      message: `BPM must be between ${MIN_BPM} and ${MAX_BPM}.`,
    });
  }

  return errors;
}

/**
 * Builds a complete project document. `id` is assigned by the repository, since
 * only it knows how ids are minted.
 *
 * `ownerId` and an empty `members` map are written from the very first save so
 * sharing can be added later without a backfill — see ADR 0004.
 */
export function createProject(
  input: NewProjectInput,
  now: number = Date.now(),
): Omit<Project, 'id'> {
  const artist = input.artist?.trim();

  return {
    schemaVersion: SCHEMA_VERSION,
    ownerId: input.ownerId,
    members: {},
    title: input.title.trim(),
    // Spread rather than `artist: undefined` — exactOptionalPropertyTypes
    // rejects the latter, and Firestore would store an explicit null.
    ...(artist ? { artist } : {}),
    discipline: input.discipline,
    grid: {
      bpm: input.bpm,
      firstBeatOffsetMs: 0,
      beatsPerBar: DEFAULT_BEATS_PER_BAR,
    },
    audio: null,
    sections: [],
    shapes: [],
    createdAt: now,
    updatedAt: now,
  };
}
