/**
 * The one place Firebase is initialised. Nothing outside `src/repositories/`
 * should import this — features talk to the interfaces in
 * `src/repositories/types.ts`. See docs/AGENTS.md.
 */

import { type FirebaseApp, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  type Firestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

/**
 * CI builds with placeholder values to prove the bundle compiles, so a missing
 * config must not throw at module load — it would break the build. Surface it
 * as a warning instead; the first real network call is where it actually fails.
 */
export function isFirebaseConfigured(): boolean {
  return Object.values(config).every((v) => typeof v === 'string' && v.length > 0);
}

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let firestoreInstance: Firestore | undefined;

function getApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(config);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
    if (useEmulators) {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!firestoreInstance) {
    // persistentLocalCache is what makes the app usable in a studio with no
    // signal: reads come from disk and writes queue until reconnect.
    // Multi-tab manager keeps a laptop with two tabs open from fighting itself.
    firestoreInstance = initializeFirestore(getApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (useEmulators) {
      connectFirestoreEmulator(firestoreInstance, '127.0.0.1', 8080);
    }
  }
  return firestoreInstance;
}
