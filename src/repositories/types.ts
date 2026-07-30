/**
 * Persistence interfaces. Feature code depends on these, never on Firebase —
 * that rule is what keeps the app testable offline and the storage decision
 * reversible. See docs/AGENTS.md.
 */

import type { AudioMeta, Id, Project, ProjectSummary, ShapePreset } from '../domain/types';

export type Unsubscribe = () => void;

export interface NewProject {
  title: string;
  artist?: string;
  discipline: string;
  bpm: number;
}

/** Partial update; `id`, `ownerId`, `members` and `schemaVersion` are not client-writable. */
export type ProjectPatch = Partial<
  Omit<Project, 'id' | 'ownerId' | 'members' | 'schemaVersion' | 'createdAt'>
>;

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: Id): Promise<Project | null>;
  /** Live updates — the same project open on a phone and a laptop stays in sync. */
  subscribe(id: Id, onChange: (project: Project | null) => void): Unsubscribe;
  create(input: NewProject): Promise<Project>;
  update(id: Id, patch: ProjectPatch): Promise<void>;
  remove(id: Id): Promise<void>;
}

export interface PresetRepository {
  list(discipline: string): Promise<ShapePreset[]>;
  subscribe(discipline: string, onChange: (presets: ShapePreset[]) => void): Unsubscribe;
  create(input: Omit<ShapePreset, 'id' | 'createdAt'>): Promise<ShapePreset>;
  update(id: Id, patch: Partial<ShapePreset>): Promise<void>;
  remove(id: Id): Promise<void>;
}

/**
 * Device-local audio cache. There is deliberately no cloud implementation of
 * this interface and there must never be one — audio is copyrighted and
 * user-supplied (ADR 0005).
 */
export interface AudioStore {
  /** Keyed by project id, so re-opening a project finds its song. */
  put(projectId: Id, file: File): Promise<AudioMeta>;
  get(projectId: Id): Promise<File | null>;
  forget(projectId: Id): Promise<void>;
  /** Whether this browser can persist a file handle rather than copying bytes. */
  supportsHandles(): boolean;
}
