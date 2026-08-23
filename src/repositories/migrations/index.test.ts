import { describe, expect, it } from 'vitest';

import { createProject } from '../../domain/project';
import { SCHEMA_VERSION, type Project } from '../../domain/types';
import { UnsupportedSchemaError, migrateProject } from './index';

const stored = (schemaVersion: number): Project => ({
  ...createProject(
    { title: 'Code Mistake', discipline: 'pole', bpm: 143, ownerId: 'alice' },
    1,
  ),
  id: 'p1',
  schemaVersion,
});

describe('migrateProject', () => {
  it('stamps a v1 document up to the current version', () => {
    // v1 → v2 converts nothing (ADR 0011): the rename was to a different
    // collection, and no stored choreo has shapes yet.
    const migrated = migrateProject(stored(1));
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.title).toBe('Code Mistake');
  });

  it('passes a current document through untouched', () => {
    const current = stored(SCHEMA_VERSION);
    expect(migrateProject(current)).toBe(current);
  });

  it('refuses a document from a newer build rather than guessing', () => {
    // The phone on last week's cached service worker must not silently strip
    // fields a laptop just wrote.
    expect(() => migrateProject(stored(SCHEMA_VERSION + 1))).toThrow(UnsupportedSchemaError);
  });
});
