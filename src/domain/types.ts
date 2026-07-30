/**
 * Pure domain types. No React, no Firebase, no DOM — see docs/AGENTS.md.
 *
 * Every time value is integer milliseconds from the start of the audio file.
 * Beats, bars and 8-counts are derived from a BeatGrid, never stored.
 */

export const SCHEMA_VERSION = 1;

export type Millis = number;
export type Id = string;

// --- Beat grid -------------------------------------------------------------

export interface BeatGrid {
  /** Beats per minute. 143 for the first project; never hardcode it elsewhere. */
  bpm: number;
  /** Where beat 1 lands in the audio, set by tap-tempo. */
  firstBeatOffsetMs: Millis;
  /** 8 makes one bar an "8-count", the natural hold unit for this project. */
  beatsPerBar: number;
}

export type SnapResolution = 'beat' | 'halfBar' | 'bar' | 'free';

// --- Sections --------------------------------------------------------------

/**
 * Open string rather than a union: new labels must not require a code change.
 * The UI suggests the common ones and accepts anything.
 */
export type SectionKind = string;

export interface Section {
  id: Id;
  label: string;
  kind: SectionKind;
  /** Token into the palette in src/ui/tokens.ts, not a raw colour. */
  colorToken: string;
  startMs: Millis;
  endMs: Millis;
}

// --- Shapes ----------------------------------------------------------------

/**
 * The ShapeSource seam (ADR 0009). Adding a way to author a shape means adding
 * a member here plus a registry entry — never an `if` in a component.
 */
export type ShapeEntrySource =
  | {
      kind: 'preset';
      presetId: Id;
      /** Copied at insert time so renaming or deleting a preset never
       *  corrupts an existing choreo. */
      nameSnapshot: string;
    }
  | { kind: 'freeText'; text: string };

export interface ShapeEntry {
  id: Id;
  sectionId: Id | null;
  startMs: Millis;
  /** Defaults to one bar. The 3-second minimum is a warning, not a hard block. */
  durationMs: Millis;
  source: ShapeEntrySource;
  notes?: string;
}

export interface ShapePreset {
  id: Id;
  name: string;
  /** Free-form grouping (e.g. "invert", "spin"). Open for the same reason as SectionKind. */
  category?: string;
  notes?: string;
  /** Discipline this preset belongs to — 'pole' for now. See DisciplineProfile. */
  discipline: string;
  createdAt: number;
  lastUsedAt?: number;
}

// --- Audio -----------------------------------------------------------------

/**
 * Metadata only. The audio itself never leaves the device (ADR 0005).
 */
export interface AudioMeta {
  name: string;
  sizeBytes: number;
  durationMs: Millis;
  /** SHA-256 over size + first 1 MB. Detects "that's a different file". */
  contentHash: string;
}

// --- Project ---------------------------------------------------------------

export type MemberRole = 'viewer' | 'editor';

export interface Project {
  id: Id;
  schemaVersion: number;
  ownerId: string;
  /** Always empty in v1; present so sharing needs no backfill (ADR 0004). */
  members: Record<string, MemberRole>;

  title: string;
  artist?: string;
  discipline: string;

  grid: BeatGrid;
  audio: AudioMeta | null;

  sections: Section[];
  shapes: ShapeEntry[];

  createdAt: number;
  updatedAt: number;
}

export type ProjectSummary = Pick<
  Project,
  'id' | 'title' | 'artist' | 'updatedAt' | 'discipline'
>;
