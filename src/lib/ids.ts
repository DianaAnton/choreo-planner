/**
 * Ids for things that live inside a document — checkpoints, refs — where
 * Firestore does not mint one for us.
 *
 * Kept out of `src/domain/` deliberately: the domain is pure, and a function
 * that returns a different value every call is the opposite of that. Domain
 * helpers take an id; this is where callers get one.
 */
export function newId(): string {
  // `randomUUID` needs a secure context. Every browser that can install a PWA
  // has one, but a plain-http LAN address for phone testing does not.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
