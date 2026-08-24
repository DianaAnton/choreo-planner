import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  collection,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Rules tests run against the emulator — `pnpm test:rules` starts one.
 * They exist because the rules are the only thing protecting the data, and a
 * typo in them is silent.
 */

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';

function newProject(ownerId: string) {
  return {
    schemaVersion: 1,
    ownerId,
    members: {},
    title: 'Code Mistake',
    discipline: 'pole',
    grid: { bpm: 143, firstBeatOffsetMs: 0, beatsPerBar: 8 },
    audio: null,
    sections: [],
    shapes: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function newSkill(name: string) {
  return {
    name,
    kind: 'quest',
    discipline: 'pole',
    refs: [],
    ladder: 'wantIt',
    checkpoints: [],
    isActive: false,
    requires: [],
    createdAt: 1,
  };
}

function newSession(date: string) {
  return { date, durationMin: 45, felt: 2, skillIds: [] };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'choreo-planner-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'projects/p1'), newProject(ALICE));
  });
});

describe('projects', () => {
  it('lets the owner read their project', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(db, 'projects/p1')));
  });

  it('denies reads to another signed-in user', async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(db, 'projects/p1')));
  });

  it('denies reads to signed-out clients', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'projects/p1')));
  });

  it('lets the owner edit content', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(updateDoc(doc(db, 'projects/p1'), { title: 'renamed', updatedAt: 2 }));
  });

  it('refuses to let a project be created under someone else', async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(db, 'projects/p2'), newProject(ALICE)));
  });

  it('refuses ownership transfer — the guard a future sharing feature relies on', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'projects/p1'), { ownerId: BOB }));
  });

  it('refuses client writes to members while sharing does not exist', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(db, 'projects/p1'), { members: { [BOB]: 'editor' } }));
  });

  it('refuses a project created with members already populated', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, 'projects/p3'), { ...newProject(ALICE), members: { [BOB]: 'viewer' } }),
    );
  });
});

describe('the project list query', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'projects/p-bob'), newProject(BOB));
    });
  });

  /**
   * Firestore evaluates a `read` rule per document, but a *query* only succeeds
   * if the constraints prove up front that every match will pass. This is the
   * exact query FirestoreProjectRepository issues — if the rules and the query
   * ever drift apart, the project list breaks with a permission error and
   * nothing else catches it.
   */
  it('allows the owner-scoped query the app actually runs', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'projects'),
          where('ownerId', '==', ALICE),
          orderBy('updatedAt', 'desc'),
        ),
      ),
    );
  });

  it('returns only the caller’s own projects', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    const snapshot = await getDocs(
      query(collection(db, 'projects'), where('ownerId', '==', ALICE)),
    );
    expect(snapshot.docs.map((d) => d.id)).toEqual(['p1']);
  });

  it('refuses an unscoped query that would read everyone’s projects', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(getDocs(query(collection(db, 'projects'))));
  });

  it('refuses a query scoped to someone else', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(getDocs(query(collection(db, 'projects'), where('ownerId', '==', BOB))));
  });
});

/**
 * The training subcollections (ADR 0011). Ownership here is the document path
 * rather than an `ownerId` field, so the per-document rules are trivial — but
 * the *queries* still have to be proved, for the reason the project-list block
 * above exists: a query whose constraints the rules cannot satisfy fails
 * wholesale, and the screen renders empty with no other signal.
 */
describe('skills', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/skills/ayesha`), newSkill('Ayesha'));
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/skills/grip`), {
        ...newSkill('Grip'),
        kind: 'practice',
      });
    });
  });

  it('lets a user manage their own skills', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(db, `users/${ALICE}/skills/gemini`), newSkill('Gemini')));
    await assertSucceeds(
      updateDoc(doc(db, `users/${ALICE}/skills/ayesha`), { ladder: 'drilling' }),
    );
    await assertSucceeds(getDoc(doc(db, `users/${ALICE}/skills/ayesha`)));
  });

  it("denies access to another user's skills", async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/${ALICE}/skills/ayesha`)));
    await assertFails(setDoc(doc(db, `users/${ALICE}/skills/planted`), newSkill('Planted')));
  });

  it('denies signed-out clients entirely', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `users/${ALICE}/skills/ayesha`)));
  });

  /** Exactly the query FirestoreTrainingRepository.subscribeSkills issues. */
  it('allows the discipline-scoped, name-ordered query the screens run', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(db, `users/${ALICE}/skills`),
          where('discipline', '==', 'pole'),
          orderBy('name'),
        ),
      ),
    );
    expect(snapshot.docs.map((d) => d.id)).toEqual(['ayesha', 'grip']);
  });

  it("refuses that same query pointed at another user's skills", async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(
      getDocs(
        query(
          collection(db, `users/${ALICE}/skills`),
          where('discipline', '==', 'pole'),
          orderBy('name'),
        ),
      ),
    );
  });
});

describe('sessions', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${ALICE}/sessions/s1`),
        newSession('2026-08-17'),
      );
      await setDoc(
        doc(ctx.firestore(), `users/${ALICE}/sessions/s2`),
        newSession('2026-07-01'),
      );
    });
  });

  it('lets a user log and read their own sessions', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(db, `users/${ALICE}/sessions/s3`), newSession('2026-08-22')),
    );
  });

  it("denies another user's history", async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/${ALICE}/sessions/s1`)));
  });

  /** Exactly the query FirestoreTrainingRepository.subscribeSessions issues. */
  it('allows the since-date range query the Today screen runs', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(db, `users/${ALICE}/sessions`),
          where('date', '>=', '2026-08-17'),
          orderBy('date', 'desc'),
        ),
      ),
    );
    expect(snapshot.docs.map((d) => d.id)).toEqual(['s1']);
  });
});

describe('inbox', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${ALICE}/inbox/i1`), {
        url: 'https://example.com/reel',
        createdAt: 1,
      });
    });
  });

  it('lets a user capture and clear their own items', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(db, `users/${ALICE}/inbox/i2`), {
        url: 'https://example.com/x',
        createdAt: 2,
      }),
    );
    await assertSucceeds(updateDoc(doc(db, `users/${ALICE}/inbox/i1`), { resolvedAt: 3 }));
  });

  it("denies another user's inbox", async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/${ALICE}/inbox/i1`)));
  });

  /** Exactly the query FirestoreTrainingRepository.subscribeInbox issues. */
  it('allows the created-at ordered query the Inbox screen runs', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      getDocs(query(collection(db, `users/${ALICE}/inbox`), orderBy('createdAt', 'desc'))),
    );
  });
});

describe('skill images', () => {
  it('lets a user store and replace their own', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(db, `users/${ALICE}/skillImages/ayesha`), {
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
        updatedAt: 1,
      }),
    );
  });

  it("denies another user's images", async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/${ALICE}/skillImages/ayesha`)));
    await assertFails(
      setDoc(doc(db, `users/${ALICE}/skillImages/planted`), { dataUrl: 'x', updatedAt: 1 }),
    );
  });
});

describe('the collection the presets used to live in', () => {
  it('is denied outright, so a stale build cannot keep writing to it', async () => {
    // Renamed to `skills/` in ADR 0011 while it was still empty. Nothing should
    // reach `presets/` any more, and the catch-all is what proves it.
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(db, `users/${ALICE}/presets/x`), { name: 'Gemini', discipline: 'pole' }),
    );
  });
});
