/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  // Firebase web config. Public by design — these ship in the client bundle and
  // identify the project; Firestore security rules are the actual access control.
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;

  /** "true" points the app at the local emulator suite instead of the cloud. */
  readonly VITE_USE_EMULATORS?: string;

  /**
   * Where that suite is listening. Defaults to 127.0.0.1; set it to the
   * laptop's LAN address when testing on a phone, where loopback means the
   * phone itself.
   */
  readonly VITE_EMULATOR_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
