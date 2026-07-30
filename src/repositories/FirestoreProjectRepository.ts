import {
  type DocumentData,
  type QueryDocumentSnapshot,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { createProject } from '../domain/project';
import type { Id, Project, ProjectSummary } from '../domain/types';
import { getDb } from '../lib/firebase';
import { migrateProject } from './migrations';
import type { NewProject, ProjectPatch, ProjectRepository, Unsubscribe } from './types';

const COLLECTION = 'projects';

/**
 * One document per project, with `sections[]` and `shapes[]` embedded — see
 * ADR 0008. Reads run through `migrateProject` so a schema change has exactly
 * one entry point.
 *
 * Timestamps are client-side `Date.now()` rather than `serverTimestamp()`.
 * A server timestamp reads back as `null` until the write reaches Firestore,
 * which would make every offline edit briefly undateable — unacceptable when
 * offline is the primary studio case.
 */
export class FirestoreProjectRepository implements ProjectRepository {
  constructor(private readonly ownerId: string) {}

  #collection() {
    return collection(getDb(), COLLECTION);
  }

  #toProject(snapshot: QueryDocumentSnapshot<DocumentData>): Project {
    return migrateProject({ ...(snapshot.data() as Omit<Project, 'id'>), id: snapshot.id });
  }

  #ownedQuery() {
    // Matches the composite index in firestore.indexes.json. Changing the
    // fields or their order here means updating that file too.
    return query(
      this.#collection(),
      where('ownerId', '==', this.ownerId),
      orderBy('updatedAt', 'desc'),
    );
  }

  async list(): Promise<ProjectSummary[]> {
    const snapshot = await getDocs(this.#ownedQuery());
    return snapshot.docs.map((d) => toSummary(this.#toProject(d)));
  }

  subscribeList(
    onChange: (projects: ProjectSummary[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.#ownedQuery(),
      (snapshot) => onChange(snapshot.docs.map((d) => toSummary(this.#toProject(d)))),
      onError,
    );
  }

  async get(id: Id): Promise<Project | null> {
    const snapshot = await getDoc(doc(this.#collection(), id));
    if (!snapshot.exists()) return null;
    return migrateProject({ ...(snapshot.data() as Omit<Project, 'id'>), id: snapshot.id });
  }

  subscribe(id: Id, onChange: (project: Project | null) => void): Unsubscribe {
    return onSnapshot(doc(this.#collection(), id), (snapshot) => {
      onChange(
        snapshot.exists()
          ? migrateProject({ ...(snapshot.data() as Omit<Project, 'id'>), id: snapshot.id })
          : null,
      );
    });
  }

  async create(input: NewProject): Promise<Project> {
    const ref = doc(this.#collection());
    const data = createProject({ ...input, ownerId: this.ownerId });

    await setDoc(ref, data);
    return { ...data, id: ref.id };
  }

  async update(id: Id, patch: ProjectPatch): Promise<void> {
    await updateDoc(doc(this.#collection(), id), { ...patch, updatedAt: Date.now() });
  }

  async remove(id: Id): Promise<void> {
    await deleteDoc(doc(this.#collection(), id));
  }
}

function toSummary(project: Project): ProjectSummary {
  const { id, title, artist, updatedAt, discipline } = project;
  return { id, title, updatedAt, discipline, ...(artist ? { artist } : {}) };
}
