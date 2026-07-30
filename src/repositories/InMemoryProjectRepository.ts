import { createProject } from '../domain/project';
import type { Id, Project, ProjectSummary } from '../domain/types';
import type { NewProject, ProjectPatch, ProjectRepository, Unsubscribe } from './types';

/**
 * Test double and offline development target. Mirrors the Firestore
 * implementation's observable behaviour — ordering, live updates, and
 * "missing document reads as null" — so tests written against it stay honest.
 */
export class InMemoryProjectRepository implements ProjectRepository {
  #projects = new Map<Id, Project>();
  #listListeners = new Set<(projects: ProjectSummary[]) => void>();
  #docListeners = new Map<Id, Set<(project: Project | null) => void>>();
  #nextId = 1;

  constructor(
    private readonly ownerId = 'test-uid',
    private readonly clock: () => number = Date.now,
  ) {}

  #owned(): Project[] {
    return [...this.#projects.values()]
      .filter((p) => p.ownerId === this.ownerId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  #emitList(): void {
    const summaries = this.#owned().map(toSummary);
    for (const listener of this.#listListeners) listener(summaries);
  }

  #emitDoc(id: Id): void {
    const listeners = this.#docListeners.get(id);
    if (!listeners) return;
    const project = this.#projects.get(id) ?? null;
    for (const listener of listeners) listener(project);
  }

  async list(): Promise<ProjectSummary[]> {
    return this.#owned().map(toSummary);
  }

  subscribeList(onChange: (projects: ProjectSummary[]) => void): Unsubscribe {
    this.#listListeners.add(onChange);
    onChange(this.#owned().map(toSummary));
    return () => this.#listListeners.delete(onChange);
  }

  async get(id: Id): Promise<Project | null> {
    return this.#projects.get(id) ?? null;
  }

  subscribe(id: Id, onChange: (project: Project | null) => void): Unsubscribe {
    const listeners = this.#docListeners.get(id) ?? new Set();
    listeners.add(onChange);
    this.#docListeners.set(id, listeners);
    onChange(this.#projects.get(id) ?? null);

    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) this.#docListeners.delete(id);
    };
  }

  async create(input: NewProject): Promise<Project> {
    const id = `p${this.#nextId++}`;
    const project: Project = {
      ...createProject({ ...input, ownerId: this.ownerId }, this.clock()),
      id,
    };

    this.#projects.set(id, project);
    this.#emitList();
    this.#emitDoc(id);
    return project;
  }

  async update(id: Id, patch: ProjectPatch): Promise<void> {
    const existing = this.#projects.get(id);
    if (!existing) throw new Error(`No project ${id}`);

    this.#projects.set(id, { ...existing, ...patch, updatedAt: this.clock() });
    this.#emitList();
    this.#emitDoc(id);
  }

  async remove(id: Id): Promise<void> {
    this.#projects.delete(id);
    this.#emitList();
    this.#emitDoc(id);
  }
}

function toSummary(project: Project): ProjectSummary {
  const { id, title, artist, updatedAt, discipline } = project;
  return { id, title, updatedAt, discipline, ...(artist ? { artist } : {}) };
}
