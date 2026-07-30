import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BPM,
  MAX_BPM,
  MAX_TITLE_LENGTH,
  MIN_BPM,
  createProject,
  validateNewProject,
} from './project';
import { SCHEMA_VERSION } from './types';

const base = { title: 'Code Mistake', bpm: DEFAULT_BPM };

describe('validateNewProject', () => {
  it('accepts a reasonable project', () => {
    expect(validateNewProject(base)).toEqual([]);
  });

  it('rejects a blank or whitespace-only title', () => {
    expect(validateNewProject({ ...base, title: '' })[0]?.field).toBe('title');
    expect(validateNewProject({ ...base, title: '   ' })[0]?.field).toBe('title');
  });

  it('rejects an over-long title', () => {
    const title = 'x'.repeat(MAX_TITLE_LENGTH + 1);
    expect(validateNewProject({ ...base, title })[0]?.field).toBe('title');
  });

  it('rejects BPM outside the sane range, inclusive bounds allowed', () => {
    expect(validateNewProject({ ...base, bpm: MIN_BPM - 1 })[0]?.field).toBe('bpm');
    expect(validateNewProject({ ...base, bpm: MAX_BPM + 1 })[0]?.field).toBe('bpm');
    expect(validateNewProject({ ...base, bpm: MIN_BPM })).toEqual([]);
    expect(validateNewProject({ ...base, bpm: MAX_BPM })).toEqual([]);
  });

  it('rejects NaN rather than letting it through as a number', () => {
    // An empty <input type=number> parses to NaN — the most likely real bug.
    expect(validateNewProject({ ...base, bpm: Number.NaN })[0]?.field).toBe('bpm');
  });

  it('reports every problem at once, not just the first', () => {
    expect(validateNewProject({ title: '', bpm: 0 })).toHaveLength(2);
  });
});

describe('createProject', () => {
  const input = {
    title: '  Code Mistake  ',
    artist: '  CORPSE x Bring Me the Horizon  ',
    discipline: 'pole',
    bpm: DEFAULT_BPM,
    ownerId: 'alice',
  };

  it('trims text and stamps both timestamps from the same clock', () => {
    const p = createProject(input, 1000);
    expect(p.title).toBe('Code Mistake');
    expect(p.artist).toBe('CORPSE x Bring Me the Horizon');
    expect(p.createdAt).toBe(1000);
    expect(p.updatedAt).toBe(1000);
  });

  it('starts empty with an 8-count grid at the given tempo', () => {
    const p = createProject(input, 1000);
    expect(p.grid).toEqual({ bpm: 143, firstBeatOffsetMs: 0, beatsPerBar: 8 });
    expect(p.sections).toEqual([]);
    expect(p.shapes).toEqual([]);
    expect(p.audio).toBeNull();
  });

  it('writes ownership fields from the first save so sharing needs no backfill', () => {
    const p = createProject(input, 1000);
    expect(p.ownerId).toBe('alice');
    expect(p.members).toEqual({});
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('omits artist entirely when blank, rather than storing an empty value', () => {
    // Firestore would happily persist "" or null; neither is meaningful, and
    // the security rules and UI both read `artist` as "present or absent".
    const p = createProject({ ...input, artist: '   ' }, 1000);
    expect('artist' in p).toBe(false);
  });
});
