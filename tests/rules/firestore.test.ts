import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
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

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'choreo-planner-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
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

describe('presets', () => {
  it('lets a user manage their own presets', async () => {
    const db = testEnv.authenticatedContext(ALICE).firestore();
    await assertSucceeds(
      setDoc(doc(db, `users/${ALICE}/presets/x`), {
        name: 'Gemini',
        discipline: 'pole',
        createdAt: 1,
      }),
    );
  });

  it("denies access to another user's presets", async () => {
    const db = testEnv.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(db, `users/${ALICE}/presets/x`)));
  });
});
